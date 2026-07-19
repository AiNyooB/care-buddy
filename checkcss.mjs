import http from 'http';

function get(u) {
  return new Promise((resolve) => {
    http.get(u, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(d));
    }).on('error', (e) => resolve('ERR:' + e.message));
  });
}

async function find(u, depth) {
  if (depth > 5) return;
  const x = await get(u);
  if (x.startsWith('ERR')) { console.log('FETCH FAIL', u, x); return; }
  if (u.endsWith('.css')) {
    console.log('=== CSS MODULE:', u, '(len ' + x.length + ') ===');
    for (const pat of ['text-type-section-title', '--type-section-title', 'section-title']) {
      const idx = x.indexOf(pat);
      console.log(pat, '->', idx >= 0 ? 'FOUND' : 'MISSING');
      if (idx >= 0) console.log('   ctx:', x.substr(idx, 120).replace(/\n/g, ' '));
    }
    return;
  }
  const re = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let mm;
  const jobs = [];
  while ((mm = re.exec(x))) {
    let p = mm[1];
    if (p.startsWith('/') && !p.startsWith('http')) jobs.push('http://localhost:5174' + p);
  }
  for (const j of jobs) await find(j, depth + 1);
}

await find('http://localhost:5174/src/styles/global.css', 0);
console.log('DONE');
