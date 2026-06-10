// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");

  // Static, self-authored SVG markup (no user data) — safe to assign as HTML.
  const BRANCH_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">' +
    '<circle cx="4.5" cy="3.3" r="1.7"/><circle cx="4.5" cy="12.7" r="1.7"/>' +
    '<circle cx="11.5" cy="5.6" r="1.7"/><path d="M4.5 5v6"/>' +
    '<path d="M4.5 8.5h3.5a3 3 0 0 0 3-3"/></svg>';
  const PLUS_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
    '<path d="M8 3.5v9M3.5 8h9"/></svg>';
  const TRASH_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.6 8h4.8l.6-8"/></svg>';
  const ARCHIVE_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2.5" y="3" width="11" height="3" rx="0.5"/><path d="M3.5 6v6.5h9V6M6.5 9h3"/></svg>';
  const PR_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="4" cy="4" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/>' +
    '<path d="M4 5.7v4.6M12 10.3V7.5a2 2 0 0 0-2-2H7.5M9 4l-1.5 1.5L9 7"/></svg>';

  function prClass(pr) {
    if (pr.state === "MERGED") return "pr-merged";
    if (pr.state === "CLOSED") return "pr-closed";
    return pr.isDraft ? "pr-draft" : "pr-open";
  }
  function prTitle(pr) {
    const s =
      pr.state === "OPEN" ? (pr.isDraft ? "draft" : "open") : pr.state.toLowerCase();
    return "PR #" + pr.number + " · " + s;
  }
  function prBadge(pr) {
    const el = document.createElement("span");
    el.className = "wt-pr " + prClass(pr);
    el.title = prTitle(pr);
    el.innerHTML = PR_SVG;
    const num = document.createElement("span");
    num.className = "pr-num";
    num.textContent = "#" + pr.number;
    el.appendChild(num);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: "openPr", url: pr.url });
    });
    return el;
  }

  function iconButton(svg, title, onClick) {
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = svg;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /** @type {{ collapsed: string[] }} */
  const state = vscode.getState() || { collapsed: [] };
  const collapsed = new Set(state.collapsed);

  function persist() {
    vscode.setState({ collapsed: [...collapsed] });
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

  function worktreeRow(wt) {
    const row = document.createElement("div");
    row.className =
      "worktree" + (wt.current ? " current" : "") + (wt.merged ? " merged" : "");
    row.title = wt.path;

    const icon = document.createElement("span");
    icon.className = "wt-icon";
    icon.innerHTML = BRANCH_SVG;
    row.appendChild(icon);

    const text = document.createElement("span");
    text.className = "wt-text";
    const label = document.createElement("span");
    label.className = "wt-label";
    label.textContent = wt.label;
    text.appendChild(label);
    // Dimmed subtitle: the worktree folder name, when it adds information.
    if (wt.dir && wt.dir !== wt.label) {
      const sub = document.createElement("span");
      sub.className = "wt-sub";
      sub.textContent = wt.dir;
      text.appendChild(sub);
    }
    row.appendChild(text);

    if (wt.pr) row.appendChild(prBadge(wt.pr));

    if (wt.merged) {
      const tag = document.createElement("span");
      tag.className = "wt-tag";
      tag.textContent = "merged";
      row.appendChild(tag);
    }

    const stat = statEl(wt.insertions, wt.deletions);
    if (stat) row.appendChild(stat);

    // Hover actions — never for the current or main worktree.
    if (!wt.current && !wt.isMain) {
      if (wt.merged) {
        row.appendChild(
          iconButton(ARCHIVE_SVG, "Archive worktree (remove + delete branch)", () => {
            vscode.postMessage({ type: "archive", path: wt.path });
          }),
        );
      }
      row.appendChild(
        iconButton(TRASH_SVG, "Remove worktree", () => {
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

  function repoGroup(repo) {
    const group = document.createElement("div");
    const isCollapsed = collapsed.has(repo.root);
    group.className = "repo-group" + (isCollapsed ? " collapsed" : "");

    const header = document.createElement("div");
    header.className = "repo-header";
    header.title = repo.root;

    const twisty = document.createElement("span");
    twisty.className = "repo-twisty";
    twisty.textContent = "▾";
    header.appendChild(twisty);

    const badge = document.createElement("span");
    badge.className = "repo-badge";
    badge.textContent = repo.name[0] || "?";
    header.appendChild(badge);

    const name = document.createElement("span");
    name.className = "repo-name";
    name.textContent = repo.name;
    header.appendChild(name);

    const count = document.createElement("span");
    count.className = "repo-count";
    count.textContent = "(" + repo.worktrees.length + ")";
    header.appendChild(count);

    header.appendChild(
      iconButton(PLUS_SVG, "Create worktree", () => {
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
    if (msg && msg.type === "render") render(msg.repos);
  });

  vscode.postMessage({ type: "ready" });
})();
