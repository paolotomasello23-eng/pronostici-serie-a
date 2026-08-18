import { config } from "dotenv";

// I test di integrazione hanno bisogno delle stesse variabili dell'app.
// Next le carica da solo, Vitest no. Se il file non c'è, i test di
// integrazione si saltano da soli e quelli unitari girano lo stesso.
config({ path: ".env.local", quiet: true });
