import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { ROOT } from './harness';

/**
 * `peer/gas-config.peer.types.d.ts` is hand-maintained for downstream
 * libraries. This keeps it faithful to `src/`: every public declaration must
 * be in the peer file with the same shape, and the peer file may declare
 * nothing `src/` does not.
 */

const PEER_FILE = join(ROOT, 'peer', 'gas-config.peer.types.d.ts');

/** Source files that declare the public surface. */
const SOURCE_FILES = [
  'src/types/gas-config.types.ts',
  'src/shared/gas-config.contract.types.ts',
  'src/gas-config.errors.ts',
  'src/gas-config.class.ts',
  'src/gas-config.ui.ts',
];

/** Declared in `src/` for its own use, deliberately absent from the peer file. */
const INTERNAL = new Set([
  'GasConfigSnapshot',
  'GasConfigChange',
  'GasConfigSaveApplied',
  'GasConfigSaveOutcome',
  'GasConfigChangeValidator',
]);

const printer = ts.createPrinter({ removeComments: true });

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.ES2020,
    true,
  );
}

function print(node: ts.Node, file: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, file);
}

/** Whether a class member is part of the public surface. */
function isPublic(member: ts.ClassElement | ts.TypeElement): boolean {
  const name = member.name;
  if (!name || !ts.isIdentifier(name)) return false;
  if (name.text.startsWith('_')) return false;
  const modifiers = ts.canHaveModifiers(member)
    ? ts.getModifiers(member)
    : undefined;
  return !modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
}

/** A member as a body-less signature, so class and interface forms compare. */
function memberSignature(
  member: ts.ClassElement | ts.TypeElement,
  file: ts.SourceFile,
): string {
  if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
    return print(
      ts.factory.createMethodSignature(
        undefined,
        member.name,
        member.questionToken,
        member.typeParameters,
        member.parameters,
        member.type,
      ),
      file,
    );
  }
  if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
    return print(
      ts.factory.createPropertySignature(
        undefined,
        member.name,
        member.questionToken,
        member.type,
      ),
      file,
    );
  }
  throw new Error(`Unsupported member: ${print(member, file)}`);
}

interface Surface {
  /** Interfaces and type aliases, printed without comments. */
  shapes: Map<string, string>;
  /** Public members of each class, by class name. */
  classes: Map<string, Map<string, string>>;
  /** Signatures of the function declarations. */
  functions: Map<string, string>;
}

/**
 * Collects the surface of the given files. Interfaces that merge into a class
 * (as `GasConfig` does in `gas-config.ui.ts`) contribute members to it.
 */
function collect(paths: string[]): Surface {
  const surface: Surface = {
    shapes: new Map(),
    classes: new Map(),
    functions: new Map(),
  };
  const merged = new Map<string, Map<string, string>>();
  const files = paths.map(parse);
  const classNames = new Set(
    files.flatMap((file) =>
      file.statements.flatMap((statement) =>
        ts.isClassDeclaration(statement) && statement.name
          ? [statement.name.text]
          : [],
      ),
    ),
  );

  const membersOf = (name: string): Map<string, string> => {
    const members = surface.classes.get(name) ?? merged.get(name);
    if (members) return members;
    const created = new Map<string, string>();
    merged.set(name, created);
    return created;
  };

  for (const file of files) {
    for (const statement of file.statements) {
      if (ts.isClassDeclaration(statement) && statement.name) {
        const members = membersOf(statement.name.text);
        surface.classes.set(statement.name.text, members);
        for (const member of statement.members) {
          if (!isPublic(member) || ts.isConstructorDeclaration(member)) {
            continue;
          }
          members.set(
            (member.name as ts.Identifier).text,
            memberSignature(member, file),
          );
        }
      } else if (ts.isInterfaceDeclaration(statement)) {
        const name = statement.name.text;
        if (classNames.has(name)) {
          const members = membersOf(name);
          for (const member of statement.members) {
            if (!isPublic(member)) continue;
            members.set(
              (member.name as ts.Identifier).text,
              memberSignature(member, file),
            );
          }
        } else {
          surface.shapes.set(name, print(statement, file));
        }
      } else if (ts.isTypeAliasDeclaration(statement)) {
        surface.shapes.set(statement.name.text, print(statement, file));
      } else if (ts.isFunctionDeclaration(statement) && statement.name) {
        surface.functions.set(
          statement.name.text,
          print(
            ts.factory.createFunctionDeclaration(
              undefined,
              undefined,
              statement.name,
              statement.typeParameters,
              statement.parameters,
              statement.type,
              undefined,
            ),
            file,
          ),
        );
      }
    }
  }

  return surface;
}

/** Whether a name belongs to the public namespace of the library. */
const isPublicName = (name: string): boolean =>
  name.startsWith('GasConfig') && !INTERNAL.has(name);

const source = collect(SOURCE_FILES.map((file) => join(ROOT, file)));
const peer = collect([PEER_FILE]);

/** Strips the `declare` keyword the peer file adds to functions and classes. */
const bare = (text: string): string => text.replace(/^declare\s+/, '');

describe('peer type declarations', () => {
  it('finds the declarations to compare', () => {
    expect(source.shapes.has('GasConfigOptions')).toBe(true);
    expect(peer.shapes.has('GasConfigOptions')).toBe(true);
    expect(peer.classes.get('GasConfig')?.has('showDialog')).toBe(true);
    expect(peer.functions.has('GasConfigRpc')).toBe(true);
  });

  it('is a type-only file: no top-level values', () => {
    const file = parse(PEER_FILE);
    const values = file.statements.filter(
      (statement) =>
        ts.isVariableStatement(statement) ||
        ts.isExpressionStatement(statement),
    );
    expect(values).toEqual([]);
  });

  it('declares every public interface and type alias of src', () => {
    const missing = [...source.shapes.keys()].filter(
      (name) => isPublicName(name) && !peer.shapes.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('declares nothing that src does not', () => {
    const extra = [...peer.shapes.keys()].filter(
      (name) => !source.shapes.has(name),
    );
    expect(extra).toEqual([]);
  });

  it('matches every interface and type alias of src', () => {
    for (const [name, text] of peer.shapes) {
      expect({ name, text }).toEqual({
        name,
        text: source.shapes.get(name),
      });
    }
  });

  it('declares the public classes with the members of src', () => {
    const expected = [...source.classes.keys()].filter(isPublicName).sort();
    expect([...peer.classes.keys()].sort()).toEqual(expected);

    for (const [name, members] of peer.classes) {
      expect({ name, members: Object.fromEntries(members) }).toEqual({
        name,
        members: Object.fromEntries(source.classes.get(name) ?? []),
      });
    }
  });

  it('declares the public functions with the signatures of src', () => {
    const expected = [...source.functions.keys()].filter(isPublicName).sort();
    expect([...peer.functions.keys()].sort()).toEqual(expected);

    for (const [name, text] of peer.functions) {
      expect(bare(text)).toBe(bare(source.functions.get(name) ?? ''));
    }
  });
});
