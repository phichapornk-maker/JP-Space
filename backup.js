// Tiny backup endpoint for JP Space.
// POST  -> saves the JSON body as the latest backup
// GET   -> returns the latest saved backup
// Both require a header "x-backup-secret" that matches the BACKUP_SECRET
// environment variable set in the Vercel project settings.

import { put, list } from '@vercel/blob';

const PATHNAME = 'jpspace/backup.json';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-backup-secret');
}

function isAuthorized(req) {
  const secret = process.env.BACKUP_SECRET;
  if (!secret) return false; // must be configured in Vercel project settings
  const provided = req.headers['x-backup-secret'];
  return typeof provided === 'string' && provided === secret;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized (missing or wrong secret)' });
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ ok: false, error: 'request body must be JSON' });
        return;
      }
      const jsonString = JSON.stringify(body);
      const blob = await put(PATHNAME, jsonString, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      res.status(200).json({
        ok: true,
        uploadedAt: new Date().toISOString(),
        bytes: jsonString.length,
        url: blob.url,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
    return;
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: PATHNAME, limit: 10 });
      const found = blobs.find((b) => b.pathname === PATHNAME);
      if (!found) {
        res.status(404).json({ ok: false, error: 'no backup saved yet' });
        return;
      }
      const r = await fetch(found.url);
      const data = await r.json();
      res.status(200).json({
        ok: true,
        uploadedAt: found.uploadedAt,
        data,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'method not allowed' });
}
