import type { ConfigLocation } from './parse-config-location';

export class MissingConfigFileError extends Error {
  readonly location: ConfigLocation;

  constructor(message: string, location: ConfigLocation) {
    super(message);

    this.name = 'MissingConfigFileError';
    this.location = location;
  }
}
