import { AutocompleteOption } from '@foundry/shared-ui';

interface ClientLike {
  id: string;
  name: string;
  email: string;
  company?: string | null;
}

interface ProjectLike {
  id: string;
  name: string;
}

/**
 * Client rows for an option autocomplete: company (or person) as the label,
 * the contact as a searchable hint. `empty` prepends a non-client choice such
 * as "All clients" or "Not linked".
 */
export function clientOptions(
  clients: readonly ClientLike[],
  empty?: AutocompleteOption,
): AutocompleteOption[] {
  const rows = clients.map((c) => ({
    value: c.id,
    label: c.company || c.name,
    hint: c.company ? c.name : c.email,
  }));
  return empty ? [empty, ...rows] : rows;
}

/** Project rows for an option autocomplete, optionally led by an `empty` choice. */
export function projectOptions(
  projects: readonly ProjectLike[],
  empty?: AutocompleteOption,
): AutocompleteOption[] {
  const rows = projects.map((p) => ({ value: p.id, label: p.name }));
  return empty ? [empty, ...rows] : rows;
}
