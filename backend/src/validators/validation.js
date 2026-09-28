import { validateRecordRules } from './record-rules.js';
import Ajv from 'ajv';
import { schemas, scalarSchemas } from '../models/schemas.js';
const ajv = new Ajv({ allErrors: true, strict: true });
const validators = Object.fromEntries(Object.entries({ ...schemas, ...scalarSchemas })
  .map(([name, schema]) => [name, ajv.compile(schema)]));
export function validate(name, value) {
  const check = validators[name];
  if (!check) throw new TypeError(`Unknown schema: ${name}`);
  if (!check(value)) throw new TypeError(`${name}: ${ajv.errorsText(check.errors)}`);
  validateRecordRules(name, value);
  return value;
}
