---
description: Design System et règles d'interface utilisateur (UI/UX) pour l'application ÉniEvent
---

# ÉniEvent Design System & UI Rules

Ce document définit les règles de conception (design system) que l'agent doit strictement suivre pour créer ou modifier toute page ou composant de l'application ÉniEvent. Il s'inspire du dashboard de l'espace pro, qui sert de référence visuelle.

## 1. Philosophie et Style Visuel
- **Flat Design Moderne** : Éviter les ombres portées intenses. Utiliser `shadow-none` sur les cartes. Le relief est donné par les interactions (animations) et de très légères bordures (`border-slate-100` ou `border-slate-200`).
- **Arrondis (Border Radius) Prononcés** : 
  - Cartes et conteneurs principaux : `rounded-2xl`
  - Boutons, liens du menu, badges : `rounded-xl`
  - Barres de recherche et éléments pilules : `rounded-full`

## 2. Palette de Couleurs (Tokens)
- **Couleur Primaire (Orange Pêche)** :
  - Texte actif / Icônes : `orange-500` ou `orange-600`
  - Arrière-plan léger (Survol/Actif) : `orange-50`
  - Bordures d'accentuation : `orange-100` ou `orange-200`
- **Couleurs Secondaires (Teal / Vert d'eau)** :
  - Utilisé par touches (ex: icônes spécifiques comme les revenus ou services) : `teal-600`.
- **Gris et Neutres (Slate)** :
  - Titres et textes importants : `slate-900`
  - Textes secondaires et descriptions : `slate-500`
  - Arrière-plans par défaut (inputs, états vides) : `slate-100` ou `slate-50`
  - Bordures très douces : `slate-100`

## 3. Animations et Micro-interactions
L'interface doit paraître "vivante" sans être surchargée.
- **Effet de Survol (Hover) Subtil** : 
  - Au survol d'un élément cliquable (carte, lien), l'arrière-plan devient très légèrement orangé (`hover:bg-orange-50`), la bordure s'illumine légèrement (`hover:border-orange-200`) et les icônes/titres prennent la couleur `orange-500` / `orange-600`.
  - Ne **pas** utiliser de fonds pleins vifs (ex: `bg-orange-500`) avec texte blanc au survol, privilégier le "teinté léger".
- **Effet de Soulèvement** :
  - Les cartes statistiques doivent s'élever au survol : `hover:-translate-y-1`.
- **Effet de Clic physique (Active)** :
  - Tous les boutons, inputs et liens doivent donner une sensation d'enfoncement au clic : `active:scale-[0.98]` ou `active:scale-[0.97]`.
- **Transitions** :
  - Toujours utiliser `transition-all`.
  - Durée pour les gros éléments (Cartes, Inputs) : `duration-300`.
  - Durée pour les petits éléments (Boutons, Liens) : `duration-200`.

## 4. Typographie
- **Police** : Inter (sans-serif, propre et lisible).
- **Titres** : `font-bold text-slate-900`
- **Textes secondaires** : `font-medium text-slate-500` ou `text-sm`.
- **Micro-copies (badges, dates)** : Utiliser des petites polices en majuscules avec un espacement large pour un look premium (`text-[10px] uppercase font-bold tracking-wider`).

## 5. Responsivité (Mobile-First)
- Les vues doivent être parfaitement lisibles sur mobile.
- Utiliser `flex-col` par défaut (mobile) et passer en `sm:flex-row` sur les écrans plus larges.
- Empêcher la rupture des éléments critiques (comme les montants financiers) à la ligne de manière inesthétique. 
- Utiliser `truncate`, `min-w-0`, et `flex-1` pour couper proprement les textes longs (comme les noms de clients) avec des points de suspension plutôt que de casser la disposition.
- **Scrollbars** : Les zones défilables (comme le menu latéral) doivent utiliser la classe utilitaire personnalisée `.no-scrollbar` pour masquer visuellement la barre tout en gardant la fonctionnalité de défilement tactile (`overflow-y-auto no-scrollbar`).
