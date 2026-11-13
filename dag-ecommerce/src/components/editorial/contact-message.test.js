import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX,
  buildContactMessage,
  contactDefaults,
  normalizeOrderNumber,
  validateContact,
  validateContactField,
} from './contact-message';

const VALID = {
  name: 'Camille Martin',
  email: 'camille@exemple.fr',
  subject: 'retour',
  order: '',
  message: 'Bonjour, je souhaite échanger ma ceinture pour la taille au-dessus.',
};

describe('validation du formulaire de contact', () => {
  it('accepte un message complet, sans numéro de commande', () => {
    expect(validateContact(VALID)).toEqual({ valid: true, errors: {}, firstInvalid: null });
  });

  it('signale chaque champ requis laissé vide, dans l’ordre d’affichage', () => {
    const result = validateContact({});
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['name', 'email', 'subject', 'message']);
    expect(result.firstInvalid).toBe('name');
  });

  it('refuse une adresse incomplète et un sujet inconnu', () => {
    expect(validateContactField('email', { email: 'camille@exemple' })).not.toBe('');
    expect(validateContactField('subject', { subject: 'spam' })).not.toBe('');
  });

  it('borne la longueur du message', () => {
    expect(validateContactField('message', { message: 'Bonjour' })).toContain('court');
    expect(validateContactField('message', { message: 'a'.repeat(MESSAGE_MAX + 1) })).toContain(String(MESSAGE_MAX));
    expect(validateContactField('message', { message: 'a'.repeat(MESSAGE_MAX) })).toBe('');
  });

  it('laisse le numéro de commande facultatif mais vérifie sa forme', () => {
    expect(validateContactField('order', { order: '' })).toBe('');
    expect(validateContactField('order', { order: ' dag-7k2m9q ' })).toBe('');
    expect(validateContactField('order', { order: '7K2M9Q' })).toBe('');
    expect(validateContactField('order', { order: '12345' })).toContain('DAG-7K2M9Q');
  });
});

describe('numéro de commande', () => {
  it('remet le numéro en forme', () => {
    expect(normalizeOrderNumber('dag 7k2m9q')).toBe('DAG-7K2M9Q');
    expect(normalizeOrderNumber('7k2m9q')).toBe('DAG-7K2M9Q');
    expect(normalizeOrderNumber('')).toBe('');
  });
});

describe('message remis à la messagerie', () => {
  it('compose l’objet, le corps et le lien mailto', () => {
    const mail = buildContactMessage({ ...VALID, order: 'dag-7k2m9q', message: 'Bonjour,\nPremière ligne.\n\nMerci & à bientôt ?' });
    expect(mail.to).toBe('contact@dag-belts.com');
    expect(mail.subject).toBe('Retour ou échange — commande DAG-7K2M9Q');
    expect(mail.body).toBe('Bonjour,\nPremière ligne.\n\nMerci & à bientôt ?\n\n—\nCamille Martin\ncamille@exemple.fr\nCommande\xa0: DAG-7K2M9Q');

    expect(mail.mailto.startsWith('mailto:contact@dag-belts.com?subject=')).toBe(true);
    const query = new URLSearchParams(mail.mailto.split('?')[1].replace(/\+/g, '%2B'));
    expect(query.get('subject')).toBe(mail.subject);
    expect(query.get('body')).toBe(mail.body.replace(/\n/g, '\r\n'));
    // rien qui puisse couper le lien : ni espace, ni retour, ni « & » nu dans les valeurs
    expect(mail.mailto).not.toMatch(/[\s]/);
    expect(mail.mailto.split('&')).toHaveLength(2);
  });

  it('n’ajoute pas de ligne de commande quand il n’y en a pas', () => {
    const mail = buildContactMessage(VALID);
    expect(mail.subject).toBe('Retour ou échange');
    expect(mail.body).not.toContain('Commande');
  });
});

describe('valeurs initiales lues dans l’URL', () => {
  it('reprend un sujet et un numéro valides', () => {
    expect(contactDefaults(new URLSearchParams('sujet=retour&commande=dag-7k2m9q'))).toMatchObject({ subject: 'retour', order: 'DAG-7K2M9Q' });
  });

  it('écarte ce qui est inconnu', () => {
    expect(contactDefaults(new URLSearchParams('sujet=<script>&commande=xyz'))).toMatchObject({ subject: '', order: '' });
    expect(contactDefaults(null)).toMatchObject({ subject: '', order: '', name: '' });
  });
});
