// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");

  /** @type {{ collapsed: string[] }} */
  const state = vscode.getState() || { collapsed: [] };
  const collapsed = new Set(state.collapsed);

  /** Display preferences from settings (sent with each render). */
  let prefs = { showSubtitle: false };

  function persist() {
    vscode.setState({ collapsed: [...collapsed] });
  }

  /** A codicon glyph span. */
  function codicon(name) {
    const el = document.createElement("span");
    el.className = "codicon codicon-" + name;
    return el;
  }

  /** A hover action button wrapping a codicon. */
  function iconButton(name, title, onClick) {
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.appendChild(codicon(name));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /** Abbreviate a line count: 999 → "999", 1300 → "1.3k", 12000 → "12k". */
  function abbr(n) {
    if (n < 1000) return String(n);
    const t = n / 1000;
    const text = t < 10 ? t.toFixed(1).replace(/\.0$/, "") : String(Math.round(t));
    return text + "k";
  }

  function statEl(ins, del) {
    if (ins === 0 && del === 0) return null;
    const wrap = document.createElement("span");
    wrap.className = "wt-stat";
    if (ins > 0) {
      const a = document.createElement("span");
      a.className = "add";
      a.textContent = "+" + abbr(ins);
      wrap.appendChild(a);
    }
    if (del > 0) {
      const d = document.createElement("span");
      d.className = "del";
      d.textContent = "-" + abbr(del);
      wrap.appendChild(d);
    }
    return wrap;
  }

  function stateText(s) {
    return s === "merged"
      ? "merged"
      : s === "pushed"
        ? "pushed (in progress)"
        : "local only";
  }

  function prText(pr) {
    const s =
      pr.state === "OPEN" ? (pr.isDraft ? "draft" : "open") : pr.state.toLowerCase();
    return "PR #" + pr.number + " · " + s;
  }

  /** Multi-line hover details, replacing the on-row badges. */
  function tooltip(wt) {
    const parts = [wt.label, wt.path, "Branch: " + stateText(wt.state)];
    if (wt.pr) parts.push(prText(wt.pr));
    return parts.join("\n");
  }

  function worktreeRow(wt) {
    const row = document.createElement("div");
    row.className = "worktree" + (wt.current ? " current" : "");
    row.title = tooltip(wt);

    // Situation-appropriate git icon (branch / merge / pull-request variants),
    // colored by tone.
    const icon = codicon(wt.icon || "git-branch");
    icon.classList.add("wt-icon", "tone-" + (wt.tone || "default"));
    row.appendChild(icon);

    const text = document.createElement("span");
    text.className = "wt-text";
    const label = document.createElement("span");
    label.className = "wt-label";
    label.textContent = wt.label;
    text.appendChild(label);
    if (prefs.showSubtitle && wt.dir && wt.dir !== wt.label) {
      const sub = document.createElement("span");
      sub.className = "wt-sub";
      sub.textContent = wt.dir;
      text.appendChild(sub);
    }
    row.appendChild(text);

    const stat = statEl(wt.insertions, wt.deletions);
    if (stat) row.appendChild(stat);

    // Hover actions.
    if (wt.pr) {
      row.appendChild(
        iconButton("git-pull-request", prText(wt.pr), () => {
          vscode.postMessage({ type: "openPr", url: wt.pr.url });
        }),
      );
    }
    if (!wt.current && !wt.isMain) {
      if (wt.state === "merged") {
        row.appendChild(
          iconButton("archive", "Archive (remove + delete branch)", () => {
            vscode.postMessage({ type: "archive", path: wt.path });
          }),
        );
      }
      row.appendChild(
        iconButton("trash", "Remove worktree", () => {
          vscode.postMessage({ type: "remove", path: wt.path });
        }),
      );
    }

    if (!wt.current) {
      row.addEventListener("click", () => {
        vscode.postMessage({ type: "switch", path: wt.path });
      });
    }
    return row;
  }

  /** Letter badge for a repo. */
  function letterBadge(repo) {
    const badge = document.createElement("span");
    badge.className = "repo-badge";
    badge.textContent = repo.name[0] || "?";
    return badge;
  }

  /** Repo avatar from GitHub, falling back to the letter badge on error. */
  function repoBadge(repo) {
    if (!repo.avatarUrl) {
      return letterBadge(repo);
    }
    const img = document.createElement("img");
    img.className = "repo-badge repo-avatar";
    img.src = repo.avatarUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      img.replaceWith(letterBadge(repo));
    });
    return img;
  }

  function repoGroup(repo) {
    const group = document.createElement("div");
    const isCollapsed = collapsed.has(repo.root);
    group.className = "repo-group" + (isCollapsed ? " collapsed" : "");

    const header = document.createElement("div");
    header.className = "repo-header";
    header.title = repo.root;

    const twisty = codicon("chevron-down");
    twisty.classList.add("repo-twisty");
    header.appendChild(twisty);

    header.appendChild(repoBadge(repo));

    const name = document.createElement("span");
    name.className = "repo-name";
    name.textContent = repo.name;
    header.appendChild(name);

    const count = document.createElement("span");
    count.className = "repo-count";
    count.textContent = repo.worktrees.length;
    header.appendChild(count);

    header.appendChild(
      iconButton("add", "Create worktree", () => {
        vscode.postMessage({ type: "create", repoRoot: repo.root });
      }),
    );

    header.addEventListener("click", () => {
      if (collapsed.has(repo.root)) collapsed.delete(repo.root);
      else collapsed.add(repo.root);
      persist();
      group.classList.toggle("collapsed");
    });

    group.appendChild(header);

    const list = document.createElement("div");
    list.className = "worktrees";
    for (const wt of repo.worktrees) list.appendChild(worktreeRow(wt));
    group.appendChild(list);

    return group;
  }

  function render(repos) {
    root.textContent = "";
    if (!repos || repos.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No git repositories found";
      root.appendChild(empty);
      return;
    }
    for (const repo of repos) root.appendChild(repoGroup(repo));
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "render") {
      if (msg.prefs) prefs = msg.prefs;
      render(msg.repos);
    }
  });

  vscode.postMessage({ type: "ready" });
})();
