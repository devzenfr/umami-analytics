import debug from 'debug';
import { Kafka, Mechanism, Producer, RecordMetadata, SASLOptions, logLevel } from 'kafkajs';
import { KAFKA, KAFKA_PRODUCER } from 'lib/db';
import * as tls from 'tls';

const log = debug('umami:kafka');

let kafka: Kafka;
let producer: Producer;
const enabled = Boolean(process.env.KAFKA_URL && process.env.KAFKA_BROKER);

function getClient() {
  const { username, password } = new URL(process.env.KAFKA_URL);
  const brokers = process.env.KAFKA_BROKER.split(',');

  const ssl: { ssl?: tls.ConnectionOptions | boolean; sasl?: SASLOptions | Mechanism } =
    username && password
      ? {
          ssl: true,
          sasl: {
            mechanism: 'scram-sha-256',
            username,
            password,
          },
        }
      : {};

  const client: Kafka = new Kafka({
    clientId: 'umami',
    brokers: brokers,
    connectionTimeout: 3000,
    logLevel: logLevel.ERROR,
    ...ssl,
  });

  if (process.env.NODE_ENV !== 'production') {
    global[KAFKA] = client;
  }

  log('Kafka initialized');

  return client;
}

async function getProducer(): Promise<Producer> {
  const producer = kafka.producer();
  await producer.connect();

  if (process.env.NODE_ENV !== 'production') {
    global[KAFKA_PRODUCER] = producer;
  }

  log('Kafka producer initialized');

  return producer;
}

async function sendMessage(
  topic: string,
  message: { [key: string]: string | number },
): Promise<RecordMetadata[]> {
  await connect();

  return producer.send({
    topic,
    messages: [
      {
        value: JSON.stringify(message),
      },
    ],
    acks: -1,
  });
}

async function sendMessages(topic: string, messages: { [key: string]: string | number }[]) {
  await connect();

  await producer.send({
    topic,
    messages: messages.map(a => {
      return { value: JSON.stringify(a) };
    }),
    acks: 1,
  });
}

async function connect(): Promise<Kafka> {
  if (!kafka) {
    kafka = process.env.KAFKA_URL && process.env.KAFKA_BROKER && (global[KAFKA] || getClient());

    if (kafka) {
      producer = global[KAFKA_PRODUCER] || (await getProducer());
    }
  }

  return kafka;
}

export default {
  enabled,
  client: kafka,
  producer,
  log,
  connect,
  sendMessage,
  sendMessages,
};
