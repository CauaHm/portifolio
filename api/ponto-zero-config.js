// Vercel Serverless Function: entrega ao jogo Ponto Zero a URL e a chave PÚBLICA (anon/publishable)
// do Supabase a partir das variáveis de ambiente do projeto na Vercel.
// Nunca devolve uma chave secreta (service_role / sb_secret_).

function pick(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function isPublicKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  // chave JWT antiga: confere o papel dentro do token
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload.role === 'anon';
  } catch (e) {
    return false;
  }
}

module.exports = (req, res) => {
  const url = pick('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'PUBLIC_SUPABASE_URL');
  const key = pick(
    'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );
  const ok = /^https:\/\/[^\s/]+\/?$/i.test(url) && isPublicKey(key);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.statusCode = 200;
  res.end(JSON.stringify(ok ? { supabaseUrl: url.replace(/\/$/, ''), supabaseAnonKey: key } : { supabaseUrl: '', supabaseAnonKey: '' }));
};
