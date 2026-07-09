# Avro

KafkaPilot supports optional Avro decoding and encoding.

## Schema Registry

Configure a Schema Registry URL in the server profile.

Confluent wire-format messages can be decoded automatically when schema IDs are available.

Schema Registry authentication can be configured in the server profile. Use the server profile `Test` action for Kafka connectivity, and verify Schema Registry access separately by opening a topic that uses Avro payloads.

## Manual Topic Schemas

Manual schemas are scoped by server and topic.

You can register schemas from:

- Topic toolbar
- Topic context menu
- Preferences

Supported inputs:

- Paste schema JSON
- Upload a schema file
- Drag and drop a schema file into the schema editor

## Produce

When a manual schema is registered for a topic, Produce can serialize the message value with that schema.

If decoding fails, KafkaPilot keeps the original payload visible and shows the decode error in the UI.

Manual schemas and Schema Registry credentials are included in app settings. Treat exported settings files carefully when secrets are included.
