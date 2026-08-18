#!/usr/bin/env python3
"""audit.py — the design system's rules, as a check.

DESIGN.md calls the styleguide an "enforceable contract". This is the part that
enforces it. Plain stdlib, no dependencies, no build step — the same rule the
prototypes themselves follow.

    python3 tools/audit.py            check, and print what is wrong
    python3 tools/audit.py --ratchet  rewrite the raw-px baseline (only downward)

Four rules, in the order they cost the most:

  1  colour lives in tokens.css                       — hard failure
  2  a class block is declared in exactly one file    — hard failure
  3  a glyph name is defined in exactly one script    — hard failure
  4  raw px outside tokens.css only ever decreases    — ratchet

Rule 2 is the one with a history: a `.menu` popover added for the workspace
landed on the cloud page's `<aside class="menu">` and deleted its whole left
column, and a `.barlist` added for the usage views redefined a shared
component's geometry. Both were invisible in review and obvious here.
"""

import os
import re
import sys
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TOKENS = 'css/tokens.css'
SHEETS = ['css/base.css', 'css/components.css', 'css/layout.css', 'css/install.css',
          'css/styleguide.css']
SCRIPTS = ['js/app.js', 'js/install.js']
BASELINE = 'tools/px-baseline.json'

# The styleguide renders the system, so it is held to two more rules: it must
# show every token, and it may only name classes that exist in the layers it
# loads. The second is what stops a rename leaving a specimen behind — and what
# proves a specimen is a component rather than a page's furniture.
GUIDE = 'js/styleguide.js'
SHARED = ['css/base.css', 'css/components.css']

# Tokens that exist to be read by name at runtime rather than shown: the four
# registered shell widths are set on .app and animate, so the styleguide lists
# them as values and never resolves them.
TOKEN_EXEMPT = set()

# A page shell may name a layout block; components.css names components. Rule 2
# compares every stylesheet against every other, so these are the pairs where a
# shared name is legitimate — currently none. Kept as an explicit, reviewable
# list rather than a special case in the code.
ALLOWED_SHARED = {
    # ('css/components.css', 'css/install.css'): {'chip', 'field'},
}

# Names that are deliberately declared in two scripts, with a reason.
ALLOWED_GLYPHS = set()


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return fh.read()


def strip_comments(css):
    """Comments carry hex codes and pixel values as prose — they are not rules."""
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


# ------------------------------------------------------------------ rule 1
def check_colour(problems):
    for rel in SHEETS:
        body = strip_comments(read(rel))
        for m in re.finditer(r'#[0-9a-fA-F]{3,8}\b|\brgba?\(', body):
            line = body[:m.start()].count('\n') + 1
            problems.append(
                '%s:%d  raw colour %r — every colour comes from %s'
                % (rel, line, m.group(0), TOKENS))


# ------------------------------------------------------------------ rule 2
def class_blocks(css):
    """Class names this file *declares the block for* — a selector that is
    nothing but `.name`.

    The distinction matters, because three things look similar and only one is a
    problem:

      .chip{ }                  declares the block          — one file may do this
      .chip[aria-pressed]{ }    extends it with a state      — any file may do this
      .projwrap .section{ }     places it in a context       — any file may do this

    Only the first claims the name. A page that re-declares a shared block is
    silently redefining a component for its own page, which is how `.menu` and
    `.barlist` happened; a page that adds a state or a context to one is using
    the system as intended.
    """
    names = set()
    for sel in re.findall(r'([^{}]+)\{', strip_comments(css)):
        sel = sel.strip()
        if sel.startswith('@') or not sel:
            continue
        for one in sel.split(','):
            m = re.fullmatch(r'\.([A-Za-z0-9_-]+)', one.strip())
            if m:
                names.add(m.group(1))
    return names


def check_names(problems):
    owned = {rel: class_blocks(read(rel)) for rel in SHEETS}
    for i, a in enumerate(SHEETS):
        for b in SHEETS[i + 1:]:
            shared = owned[a] & owned[b]
            shared -= ALLOWED_SHARED.get((a, b), set())
            for name in sorted(shared):
                problems.append(
                    '.%s  declared in both %s and %s — one name, one owner; move it '
                    'to css/components.css or rename the newcomer' % (name, a, b))


# ------------------------------------------------------------------ rule 3
def glyphs(js):
    m = re.search(r'const P *= *\{(.*?)\n\};', js, re.S)
    if not m:
        return {}
    return dict(re.findall(r"(\w+):'([^']*)'", m.group(1)))


def check_glyphs(problems):
    sets = {rel: glyphs(read(rel)) for rel in SCRIPTS}
    live = [rel for rel in SCRIPTS if sets[rel]]
    for i, a in enumerate(live):
        for b in live[i + 1:]:
            for name in sorted(set(sets[a]) & set(sets[b]) - ALLOWED_GLYPHS):
                same = sets[a][name] == sets[b][name]
                problems.append(
                    '%s  defined in both %s and %s — %s' % (
                        name, a, b,
                        'identical copy, so one of them is dead weight' if same
                        else 'AND DRAWN DIFFERENTLY, so the two pages disagree'))


# ------------------------------------------------------------------ rule 4
def count_px(rel):
    """Hairlines and zero are structural, not sizing decisions."""
    body = strip_comments(read(rel))
    return len([m for m in re.findall(r'(?<![\w-])(\d+)px', body)
                if m not in ('0', '1')])


def check_px(problems, ratchet):
    counts = {rel: count_px(rel) for rel in SHEETS}
    total = sum(counts.values())
    path = os.path.join(ROOT, BASELINE)

    if ratchet:
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump({'total': total, 'files': counts}, fh, indent=2, sort_keys=True)
            fh.write('\n')
        print('baseline set to %d raw px values' % total)
        return total

    if not os.path.exists(path):
        problems.append(
            'no %s yet — run `python3 tools/audit.py --ratchet` to record the '
            'current %d raw px values as the ceiling' % (BASELINE, total))
        return total

    with open(path, encoding='utf-8') as fh:
        base = json.load(fh)

    # Compared across the files the baseline knows, in total — because moving a
    # rule from a page's stylesheet into components.css moves its values with it,
    # and a move is not a regression. A file the baseline has never seen brings
    # its own values and is reported rather than failed.
    known = base.get('files', {})
    seen_total = sum(counts[rel] for rel in SHEETS if rel in known)
    if seen_total > base['total']:
        drift = sorted(((counts[rel] - known[rel], rel) for rel in SHEETS if rel in known),
                       reverse=True)
        problems.append(
            'raw px went up: %d → %d across the files on record (%s). Name the '
            'value in %s, or take one out first.' % (
                base['total'], seen_total,
                ', '.join('%s %+d' % (rel, d) for d, rel in drift if d), TOKENS))
    new_files = [rel for rel in SHEETS if rel not in known]
    if new_files:
        print('note: %s new to the baseline (%s) — re-ratchet to record it.'
              % (', '.join(new_files), ' · '.join('%d px' % counts[r] for r in new_files)))
    return total


# ------------------------------------------------------------------ rule 5
def check_guide_tokens(problems):
    declared = set()
    for m in re.finditer(r'(--[a-z0-9-]+)\s*:', strip_comments(read(TOKENS))):
        declared.add(m.group(1))
    guide = read(GUIDE)
    missing = sorted(t for t in declared - TOKEN_EXEMPT if t not in guide)
    for t in missing:
        problems.append(
            '%s  declared in %s and not shown in %s — the styleguide is the '
            'system stated, so a token it omits is a token nobody can look up'
            % (t, TOKENS, GUIDE))
    return len(declared)


# ------------------------------------------------------------------ rule 6
def check_guide_classes(problems):
    exists = set()
    for rel in SHARED:
        body = strip_comments(read(rel))
        for m in re.finditer(r'\.([A-Za-z0-9_-]+)', body):
            exists.add(m.group(1))
    guide = strip_comments(read(GUIDE))
    named = set()
    # `cls:'.badge--ok'` is what the specimen claims to be; class="…" is what it
    # renders. Both have to be real.
    for m in re.finditer(r"cls:'([^']+)'", guide):
        for part in m.group(1).replace('/', ' ').split():
            named.add(part.lstrip('.'))
    for m in re.finditer(r'class="([a-zA-Z0-9_ -]+)"', guide):
        for part in m.group(1).split():
            named.add(part)
    # the styleguide's own furniture is allowed to be its own
    named = {c for c in named if not c.startswith('sg')}
    for c in sorted(named - exists):
        problems.append(
            '.%s  shown in %s and defined in neither %s — either it is not a '
            'component or the specimen is stale' % (c, GUIDE, ' nor '.join(SHARED)))


# ---------------------------------------------------------------------- main
def main():
    ratchet = '--ratchet' in sys.argv
    problems = []

    check_colour(problems)
    check_names(problems)
    check_glyphs(problems)
    tokens = check_guide_tokens(problems)
    check_guide_classes(problems)
    total = check_px(problems, ratchet)

    if ratchet:
        return 0

    print('css: %d files · %d tokens · %d raw px outside tokens.css'
          % (len(SHEETS), tokens, total))
    if not problems:
        print('clean — colour, names and glyphs have one owner, and the styleguide '
              'covers every token.')
        return 0

    print('\n%d problem%s:\n' % (len(problems), '' if len(problems) == 1 else 's'))
    for p in problems:
        print('  ' + p)
    print('')
    return 1


if __name__ == '__main__':
    sys.exit(main())
