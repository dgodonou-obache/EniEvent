import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Les tests de base de données montent chacun un Postgres complet en
    // WebAssembly et y rejouent toutes les migrations. Plusieurs fichiers
    // démarrant en parallèle, le défaut de 10 s ne suffit plus.
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // Quatre fichiers montent chacun une instance PGlite. Trop de processus
    // simultanés et l'un d'eux meurt sans message exploitable
    // (« Worker exited unexpectedly », code 0xC0000003) : c'est la mémoire du
    // bac à sable WebAssembly, pas le code testé. Le symptôme est intermittent
    // et change de fichier à chaque exécution — plafonner est la seule façon de
    // le rendre reproductible.
    //
    // Au premier niveau : `poolOptions` a été retiré en Vitest 4, et une clé
    // inconnue est ignorée en silence — la limite ne s'appliquait pas.
    maxWorkers: 2,
  },
});
