# quota-bar

A Claude Code mod that shows your Claude subscription's remaining quota and reset times right above the prompt box, so you don't have to open Settings → Usage.

It reads the rate-limit windows the engine already reports (`five_hour`, `seven_day`), so it needs no token and makes no network requests of its own.

- A compact status line under the prompt, beside the model picker: `额度 5h 62% 16:40 · 7d 85% 11/05` (percent left and the reset time or date); `/quota` shows the long form
- `/quota` prints the full detail; `/quota hide` and `/quota show` toggle the status line
- A toast the first time a window passes 80% and 95% used
- The last figures are cached, so a new session shows them before the first reply

Works in the Code tab / Claude Code sessions only (not Chat), and only on a subscription plan. Figures update after each reply, so they can be a little stale. Reset clock times use the local time zone.

## Install

At the prompt of a terminal session:

```
/plugin install quota-bar --marketplace SeraphLelouch/quota-bar
```

From a shell:

```
claude plugin install quota-bar --marketplace SeraphLelouch/quota-bar
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `SeraphLelouch/quota-bar`, then Add plugin.

## License

MIT
