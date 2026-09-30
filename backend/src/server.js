import pg from 'pg';
import { verifyEvent } from 'nostr-tools/pure';
import { readConfig } from './config/index.js';
import { PostgresOfferStore } from './repositories/offers.js';
import { createOfferService } from './services/offers/service.js';
import { createRelayPublisher } from './services/nostr/publisher.js';
import { createLndClient } from './services/payments/lnd-client.js';
import { createApp } from './app.js';

const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
const store = new PostgresOfferStore(pool);
await pool.query('SELECT 1 FROM nostr_outbox LIMIT 1');
const paymentProvider = createLndClient({ restUrl: config.lndRestUrl, macaroon: config.lndMacaroon });
const service = createOfferService({ store, verifyEvent, paymentProvider, ...config });
const publish = createRelayPublisher({ relays: config.relays });
const server = createApp({ service, verifyEvent, origin: config.origin, corsOrigin: config.corsOrigin });
let stopping = false;
let active;
const tick = () => { if (!stopping && !active) active = store.publishNext(publish).catch(error => console.error('Publication worker:', error.message)).finally(() => { active = undefined; }); };
const interval = setInterval(tick, 1000);
server.listen(config.port, config.host, () => console.log(`ContentPort API listening on ${config.origin}`));
async function shutdown() { if (stopping) return; stopping = true; clearInterval(interval); await new Promise(resolve => server.close(resolve)); await active; await pool.end(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
