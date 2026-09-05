import { execSync } from "node:child_process";

try {
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

  const blockedBranches = ["master", "main", "homolog", "dev", "development"];

  if (blockedBranches.includes(currentBranch)) {
    console.error(
      "\x1b[31m%s\x1b[0m",
      `❌ [Lefthook] Erro: Você não pode fazer commits direto na branch '${currentBranch}'!`,
    );
    console.error("💡 Crie uma nova branch (ex: git checkout -b feat/minha-feature) e envie um PR.\n");
    process.exit(1);
  }

  process.exit(0);
} catch (error) {
  console.error("\x1b[33m%s\x1b[0m", "[Lefthook] Aviso: Não foi possível detectar a branch atual.");
  console.error("Detalhe:", error?.message || error);
  process.exit(1);
}
