// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");

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
    row.className = "worktree" + (wt.current ? " current" : "");
    row.title = wt.path;

    const dot = document.createElement("span");
    dot.className = "wt-dot";
    row.appendChild(dot);

    const label = document.createElement("span");
    label.className = "wt-label";
    label.textContent = wt.label;
    row.appendChild(label);

    const stat = statEl(wt.insertions, wt.deletions);
    if (stat) row.appendChild(stat);

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
    twisty.className = "repo-twisty codicon";
    twisty.textContent = "▾";
    header.appendChild(twisty);

    const badge = document.createElement("span");
    badge.className = "repo-badge";
    badge.textContent = (repo.name[0] || "?");
    header.appendChild(badge);

    const name = document.createElement("span");
    name.className = "repo-name";
    name.textContent = repo.name;
    header.appendChild(name);

    const count = document.createElement("span");
    count.className = "repo-count";
    count.textContent = "(" + repo.worktrees.length + ")";
    header.appendChild(count);

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
