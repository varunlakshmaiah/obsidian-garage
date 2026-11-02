# Design: Garage

**North star: the garage logbook.** Each due item is a card with a small caps head (when it is due) and a body (what and how far along). Vehicles are tiles. Status is shown by a stamp (OVERDUE, DUE SOON) and a coloured progress bar. Nothing else changes colour.

Follows the rules of [Renewals' DESIGN.md](https://github.com/varunlakshmaiah/obsidian-renewals/blob/main/DESIGN.md):

- **Borrowed ink:** every colour is an Obsidian theme variable. Status hues are `color-mix(in srgb, var(--color-red|orange|green) 55%, var(--text-normal))` so they stay readable in light and dark themes.
- **Flat:** hairline borders (`--background-modifier-border`) and one tone step (`--background-secondary`) for cards. No shadows, hover is `--background-modifier-hover`.
- **Type:** the host font, sizes in em, tabular numbers everywhere. Uppercase tracked text only for card heads, tab caps, field tabs and stamps.
- **Layout:** container queries on the pane (`container: vm / inline-size`) at 960, 640 and 420px, never window media queries (the modal is the one exception, since it is not inside the pane). At 640px and below tabs take a full row and every control is at least 44px tall.
- **Focus:** a 2px `--interactive-accent` outline at a 2px offset on every button.

Class prefix `vm-`. Everything is scoped to `.vm-root` and `.vm-modal`.
