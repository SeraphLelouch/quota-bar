# quota-bar

A Claude Code mod that shows your Claude subscription's remaining quota and reset times right above the prompt box, so you don't have to open Settings → Usage.

It reads the rate-limit windows the engine already reports (`five_hour`, `seven_day`), so it needs no token and makes no network requests of its own.

- A band above the prompt: `5小时 剩 62% · 16:40 重置（2小时13分后） | 7天 剩 14.5% · 11/05 08:00 重置（3天0小时后）`; turns to the warning color under 20% left, countdown refreshes every minute
- A status-line entry with the short form
- `/quota` prints the full detail; `/quota hide` and `/quota show` toggle the band
- A toast the first time a window passes 80% and 95% used
- The last figures are cached, so a new session shows them before the first reply

Works in the Code tab / Claude Code sessions only (not Chat), and only on a subscription plan. Figures update after each reply, so they can be a little stale. Reset clock times use the local time zone.

## Install

At the prompt of a terminal session:

```
/plugin install quota-bar --marketplace <owner>/<repo>
```

From a shell:

```
claude plugin install quota-bar --marketplace <owner>/<repo>
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `<owner>/<repo>`, then Add plugin.

## License

MIT
