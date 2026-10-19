"""Condense out-progression-*.txt into one row per build and level."""
import re, sys
lines = open(sys.argv[1]).read().splitlines()[1:]
cur = None; rows = {}
for l in lines:
    if not l.startswith('   '):
        m = re.match(r'(\S+) L(\d+) life(\d+) \[(\S+)\]', l); cur = (m[1], int(m[2])); rows[cur] = {'life': m[3], 'sk': m[4], 'packs': []}
    else:
        k = l.split()[0]; m = re.search(r'([\d.]+)s dmg\s*(\d+)% pot([\d.]+) mp([\d.]+) dps\s*(\d+)', l)
        v = (float(m[1]), int(m[2]), float(m[3]), float(m[4]), int(m[5]), 'DEAD' in l or 'TIMEOUT' in l)
        if k.startswith('pack'): rows[cur]['packs'].append(v)
        else: rows[cur][k] = v
print(f"{'build':15} L  life  skill                packTTK packDmg champTTK champDmg uniqTTK uniqDmg pots  mp")
for (b, L), r in rows.items():
    ps = r['packs']; ttk = sum(p[0] for p in ps) / len(ps); dm = sum(p[1] for p in ps) / len(ps)
    allv = ps + [r['champions'], r['unique']]
    bad = ' !' if any(v[5] for v in allv) else ''
    print(f"{b:15} {L:2} {r['life']:>4}  {r['sk']:20} {ttk:6.1f}s {dm:5.0f}%  {r['champions'][0]:6.1f}s {r['champions'][1]:5d}%  {r['unique'][0]:6.1f}s {r['unique'][1]:5d}% {sum(v[2] for v in allv):5.1f} {sum(v[3] for v in allv):5.1f}{bad}")
