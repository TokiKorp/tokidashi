# Tokidachi 🥚

**Desktop companion idle + care** — un petit être en pixel art vit sur ton bureau,
se nourrit de TOKEN (ta capacité IA), et peut apprendre à devenir autosuffisant.
Voir la spec complète : [docs/GDD.md](docs/GDD.md).

## Lancer

```bash
npm install          # une fois
npm run tauri dev    # l'app de bureau (Tauri, fenêtre always-on-top)
npm run dev          # ou : version navigateur (fallback localStorage, sans lock/unlock)
```

Prérequis : Node ≥ 20 et Rust (`rustup`) pour la coque Tauri.

## Tester

```bash
npm test             # tests du cœur de simulation (vitest)
npm run typecheck    # tsc --noEmit
cd src-tauri && cargo check
```

## Architecture

| Dossier | Rôle |
|---|---|
| `src/game/` | **Cœur pur et déterministe** : types, config data-driven (équilibrage), simulation (`advanceSim`), actions joueur, banque de réactions scriptées (« Cerveau local ») |
| `src/ai/` | Interface `AIProvider` pluggable (GDD §5.3) — MVP : mode DEV simulé, zéro coût |
| `src/state/` | Store zustand, boucle de tick (temps actif uniquement), persistance (`tauri-plugin-store`, fallback localStorage), écoute lock/unlock |
| `src/render/` | Pixel art procédural (grilles de caractères → textures) + scène PixiJS animée |
| `src/ui/` | Panneaux React : jauges, nourrissage, compétences, rapport de retour, mémorial, panneau dev |
| `src-tauri/` | Coque Rust : fenêtre compagnon, détection verrouillage session (macOS : poll `CGSessionCopyCurrentDictionary`) |

Principes tenus du GDD : simulation **gelée écran verrouillé** (§6.1), **permadeath**
+ mémorial (§8.3), voie 100 % gratuite viable et transparence des coûts (§12),
équilibrage data-driven dans `src/game/config.ts` (§11).

## Panneau dev (⚙ en jeu)

Accélérateur de temps (×1/×10/×60/×1000), TOKEN illimités (défaut en mode DEV),
recharge de la capacité simulée, simulation du verrouillage, remise à zéro.

## État du MVP (milestone 1)

- [x] Stades Œuf → Blob → Enfant, éclosion par tapotement ou temps
- [x] Satiété / Vitalité / Humeur, dégradation Faim → Humeur → Vitalité → Maladie → Mort
- [x] Nourrissage 5 aliments (Miettes/TOKEN), réactions par tranche × humeur × stade
- [x] **Apparence procédurale** : génome unique par Compagnon (forme, teinte, oreilles, taches)
- [x] **Croissance sans plafond** : il s'engraisse avec les TOKEN mangés (échelle log, paliers 100 → 10k → 1M → ∞)
- [x] Échelle TOKEN réaliste (ration 100, festin 10k, budget 1M) + illimités en DEV
- [x] **Prix dynamiques** : spammer un aliment fait grimper son prix (+60 %/achat, demi-vie 5 min active)
- [x] **Miettes visibles et animées** : 1 sprite = 1 Miette dispo, envol depuis le Compagnon vers une position aléatoire, empilement par colonnes (carte de hauteurs), envolée au ramassage (clic) ; débit +N/h affiché
- [x] **Arbre de compétences** : 7 compétences avec prérequis, stade requis affiché, racines dès le Blob (1 slot), 4 slots Enfant
- [x] **Niveaux de compétences** : amélioration payante (coût ×1,8/niveau) + ré-étude, effet +50 %/niveau, max 5 (Garde-manger 1)
- [x] Gel au verrouillage (macOS) + rapport de retour
- [x] Permadeath + mémorial, autosave
- [x] Fenêtre overlay : transparente, sans bordures, always-on-top, position bas-droite, contrôles masquables
- [ ] Click-through sélectif (clics au bureau à travers les zones transparentes)
- [ ] Provider gratuit réel (Gemini free / Ollama) — interface prête
- [ ] Tray système + notifications douces
- [ ] Lock/unlock Windows & Linux
