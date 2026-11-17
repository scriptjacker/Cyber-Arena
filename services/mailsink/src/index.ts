import { SMTPServer, type SMTPServerSession } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { BRAND, domainOf, newId } from '@chetna/core';
import { prisma, runtimeConfig } from '@chetna/db';

/**
 * The controlled test environment's mail sink.
 *
 * A real SMTP server — the worker speaks the actual wire protocol to it — bound
 * to loopback only. Captured mail is stored and rendered in the participant
 * webmail inside the console, so the whole journey (inbox, read, click, report)
 * happens in one place and nothing can leave the machine.
 *
 * Chosen over Mailpit deliberately: one fewer dependency, no Docker, and the
 * captured message becomes part of the product rather than sitting in a
 * separate tool the judges have to be told about.
 *
 * Defence in depth: the sink enforces the same environment rules as policy gate
 * G7 even though the worker has already checked them. A sink that would happily
 * relay anywhere is a latent hazard sitting in the repository.
 */

const RESERVED_SUFFIXES = ['.test', '.example', '.invalid', '.localhost'];
const RESERVED_EXACT = ['localhost'];

function isReservedTestDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  if (RESERVED_EXACT.includes(d)) return true;
  return RESERVED_SUFFIXES.some((s) => d.endsWith(s));
}

function isLoopback(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  const a = remoteAddress.replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || a.startsWith('127.');
}

export interface SinkOptions {
  host?: string;
  port?: number;
  quiet?: boolean;
}

export function createSink(options: SinkOptions = {}) {
  const cfg = runtimeConfig();
  const host = options.host ?? cfg.smtpHost;
  const port = options.port ?? cfg.smtpPort;
  const offline = cfg.mode === 'offline';
  const log = (msg: string) => {
    if (!options.quiet) console.log(msg);
  };

  const server = new SMTPServer({
    name: `${BRAND.name.toLowerCase()}-mailsink`,
    banner: `${BRAND.name} controlled test environment — captures mail, delivers nowhere`,
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    hideSTARTTLS: true,
    size: 10 * 1024 * 1024,

    onConnect(session: SMTPServerSession, callback) {
      if (offline && !isLoopback(session.remoteAddress)) {
        log(`  ✗ refused connection from ${session.remoteAddress} (offline mode: loopback only)`);
        return callback(new Error('550 offline mode accepts loopback connections only'));
      }
      return callback();
    },

    onRcptTo(address, _session, callback) {
      const domain = domainOf(address.address);
      if (offline && !isReservedTestDomain(domain)) {
        log(`  ✗ refused recipient ${address.address} (offline mode: reserved test domains only)`);
        return callback(
          new Error('550 offline mode accepts reserved test domains only (.test/.example/.invalid)'),
        );
      }
      return callback();
    },

    onData(stream, session, callback) {
      simpleParser(stream)
        .then(async (mail) => {
          const to = session.envelope.rcptTo[0]?.address ?? '(unknown)';
          const from = session.envelope.mailFrom
            ? session.envelope.mailFrom.address
            : '(unknown)';

          // The worker stamps the assignment id, so a captured message can be
          // tied back to exactly one simulation without parsing the body.
          const headers: Record<string, string> = {};
          for (const key of [
            BRAND.simulationHeader.toLowerCase(),
            BRAND.simulationHeaderAlt.toLowerCase(),
            'x-chetna-campaign',
            'x-chetna-assignment',
          ]) {
            const value = mail.headers.get(key);
            if (typeof value === 'string') headers[key] = value;
          }

          const assignmentId = headers['x-chetna-assignment'];

          await prisma.message.create({
            data: {
              id: newId('msg'),
              assignmentId: assignmentId ?? null,
              toAddress: to,
              fromAddress: from,
              subject: mail.subject ?? '(no subject)',
              html: typeof mail.html === 'string' ? mail.html : (mail.textAsHtml ?? ''),
              text: mail.text ?? null,
              headersJson: JSON.stringify(headers),
            },
          });

          const marked = headers[BRAND.simulationHeader.toLowerCase()] ? '' : '  ⚠ NO SIMULATION HEADER';
          log(`  → captured for ${to}: ${mail.subject ?? '(no subject)'}${marked}`);
          callback();
        })
        .catch((err: unknown) => {
          callback(err instanceof Error ? err : new Error(String(err)));
        });
    },
  });

  return {
    server,
    start: () =>
      new Promise<void>((resolve) => {
        server.listen(port, host, () => {
          console.log(`\n${BRAND.name} mail sink listening on ${host}:${port}`);
          if (offline) {
            console.log('  offline mode: loopback connections and reserved test domains only');
            console.log(`  verify with:  netstat -ano | findstr ${port}`);
          } else {
            console.log('  LIVE mode: the sink still captures; nothing is relayed onward.');
          }
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

const isEntry = process.argv[1]?.replace(/\\/g, '/').includes('services/mailsink');
if (isEntry) {
  const sink = createSink();
  await sink.start();
  const shutdown = async () => {
    console.log('\nstopping mail sink');
    await sink.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
