/**
 * Legge tutte le righe di una query, a pagine.
 *
 * Supabase restituisce al massimo 1000 righe per richiesta (l'impostazione
 * "Max rows" del progetto), e lo fa in silenzio: niente errore, solo una
 * lista più corta. Per la classifica significa perdere punti senza che
 * nessuno se ne accorga — con dieci giocatori bastano dieci giornate per
 * superare il tetto.
 *
 * La query deve avere un ordinamento stabile (su colonne che insieme sono
 * uniche): senza, due pagine consecutive potrebbero sovrapporsi o saltare
 * delle righe.
 *
 * Ci si ferma alla prima pagina vuota e non alla prima pagina "corta": se
 * il progetto avesse un tetto più basso di 1000, una pagina corta non
 * vorrebbe dire che le righe sono finite.
 *
 * Volutamente senza `server-only`: riceve la query dall'esterno, così è
 * usabile dalle pagine, dalle API e dai test.
 */

export const PAGE_SIZE = 1000;

interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];

  for (;;) {
    const { data, error } = await page(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);

    const batch = data ?? [];
    if (batch.length === 0) return rows;
    rows.push(...batch);
  }
}
