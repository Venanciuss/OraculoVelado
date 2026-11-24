/* Regras locais do duelo. S e R representam decisões seguras e de risco. */
(function (root) {
  "use strict";
  const TOOLS = [
    "LUPA",
    "LGPD",
    "INJECAO_PROMPT",
    "HUMAN_IN_THE_LOOP",
    "ANTI_DDOS",
  ];
  function shuffled(values, random = Math.random) {
    const a = values.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  class Engine {
    constructor(random = Math.random) {
      this.random = random;
      this.actors = [0, 1].map(() => ({
        hp: 5,
        inventory: [],
        used: [],
        blocked: false,
      }));
      this.turn = 0;
      this.deck = [];
      this.batch = 0;
      this.multiplier = 1;
      this.known = null;
      this.over = false;
      this.winner = null;
      this.events = [];
      this.newBatch();
    }
    integer(n) {
      return Math.floor(this.random() * n);
    }
    newBatch() {
      const safe = 1 + this.integer(4),
        risk = 1 + this.integer(4);
      this.deck = shuffled(
        [...Array(safe).fill("S"), ...Array(risk).fill("R")],
        this.random,
      );
      this.batch++;
      this.multiplier = 1;
      this.known = null;
      for (const a of this.actors) {
        const count = 2 + this.integer(3);
        for (let i = 0; i < count; i++)
          if (a.inventory.length < 8)
            a.inventory.push(TOOLS[this.integer(TOOLS.length)]);
      }
      this.events.push({ type: "batch", batch: this.batch, safe, risk });
    }
    probability() {
      if (this.turn === 1 && this.known !== null)
        return this.known === "R" ? 1 : 0;
      return this.deck.length
        ? this.deck.filter((c) => c === "R").length / this.deck.length
        : 0;
    }
    use(index) {
      const a = this.actors[this.turn],
        tool = a.inventory[index],
        other = this.actors[1 - this.turn];
      if (
        this.over ||
        !tool ||
        a.used.length >= 2 ||
        a.used.includes(tool) ||
        (tool === "ANTI_DDOS" && other.blocked)
      )
        return null;
      const result = { type: "tool", actor: this.turn, tool, healed: 0 };
      a.inventory.splice(index, 1);
      if (tool === "LUPA") {
        result.revealed = this.deck[0];
        if (this.turn === 1) this.known = result.revealed;
      }
      if (tool === "LGPD") {
        result.healed = Math.min(1, 5 - a.hp);
        a.hp += result.healed;
      }
      if (tool === "INJECAO_PROMPT") this.multiplier = 2;
      if (tool === "ANTI_DDOS") other.blocked = true;
      if (tool === "HUMAN_IN_THE_LOOP") {
        result.discarded = this.deck.shift();
        this.known = null;
      }
      a.used.push(tool);
      this.events.push(result);
      if (!this.deck.length) this.newBatch();
      return result;
    }
    process(self) {
      if (this.over) throw Error("Match ended");
      const actor = this.turn,
        target = self ? actor : 1 - actor,
        card = this.deck.shift(),
        a = this.actors[actor],
        t = this.actors[target];
      const riskBefore =
        this.deck.filter((c) => c === "R").length +
        (card === "R" ? 1 : 0) +
        "/" +
        (this.deck.length + 1);
      this.known = null;
      a.used = [];
      const damage = card === "R" ? Math.min(t.hp, this.multiplier) : 0;
      t.hp -= damage;
      this.multiplier = 1;
      const result = {
        type: "card",
        actor,
        target,
        self,
        card,
        damage,
        riskBefore,
        hp: t.hp,
        extra: false,
        skipped: false,
      };
      if (t.hp === 0) {
        this.over = true;
        this.winner = 1 - target;
      } else if (self && card === "S") {
        result.extra = true;
      } else if (this.actors[1 - actor].blocked) {
        this.actors[1 - actor].blocked = false;
        result.extra = true;
        result.skipped = true;
      } else this.turn = 1 - actor;
      this.events.push(result);
      if (!this.over && !this.deck.length) this.newBatch();
      return result;
    }
    machineTool() {
      const a = this.actors[1],
        other = this.actors[0];
      if (a.used.length >= 2) return -1;
      const available = (t) => a.inventory.includes(t) && !a.used.includes(t);
      let t = null;
      if (a.hp < 5 && available("LGPD")) t = "LGPD";
      else if (!other.blocked && available("ANTI_DDOS")) t = "ANTI_DDOS";
      else if (this.known === null && available("LUPA")) t = "LUPA";
      else if (
        this.probability() === 1 &&
        this.multiplier === 1 &&
        available("INJECAO_PROMPT")
      )
        t = "INJECAO_PROMPT";
      return t ? a.inventory.indexOf(t) : -1;
    }
  }
  root.OracleGame = { Engine, TOOLS, shuffled };
})(typeof window === "undefined" ? globalThis : window);
