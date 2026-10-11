import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export type Env = {
  DB: D1Database;
  FICHIERS: R2Bucket;
  ORIGINES_AUTORISEES: string;
  SEL_MOT_DE_PASSE: string;
};

export type Role = 'sportif' | 'encadrant' | 'recruteur' | 'admin';

export type Compte = {
  id: string;
  nom: string;
  role: Role;
  structure_id: string | null;
};

export type Variables = { compte?: Compte };
