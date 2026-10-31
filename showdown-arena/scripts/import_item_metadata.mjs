import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const metadataDirectory = path.resolve(__dirname, "../data/metadata");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArguments(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const filenames = args.filter((arg) => !arg.startsWith("--"));
  const allowedFlags = new Set(["--apply", "--overwrite"]);
  const unknownFlags = [...flags].filter((flag) => !allowedFlags.has(flag));

  if (unknownFlags.length) {
    throw new Error(`Unknown option(s): ${unknownFlags.join(", ")}`);
  }
  if (filenames.length !== 1) {
    throw new Error(
      "Usage: node scripts/import_item_metadata.mjs <metadata-file.json> [--apply] [--overwrite]",
    );
  }
  if (flags.has("--overwrite") && !flags.has("--apply")) {
    throw new Error("--overwrite requires --apply; preview never writes data.");
  }

  const argument = filenames[0];
  const filePath = path.isAbsolute(argument)
    ? argument
    : path.dirname(argument) === "."
      ? path.join(metadataDirectory, argument)
      : path.resolve(process.cwd(), argument);

  if (path.extname(filePath).toLowerCase() !== ".json") {
    throw new Error("The metadata file must have a .json extension.");
  }

  return {
    filePath,
    apply: flags.has("--apply"),
    overwrite: flags.has("--overwrite"),
  };
}

function readEnv(name, envText) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = envText.match(new RegExp(`^${escapedName}=(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}

function validateRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return ["record must be a JSON object"];
  }
  if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id)) {
    errors.push("id must be a valid UUID");
  }
  for (const field of ["topic", "item_name", "item_description"]) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      errors.push(`${field} is required and must be a non-empty string`);
    }
  }
  if (
    !Array.isArray(record.item_facts) ||
    record.item_facts.length < 3 ||
    record.item_facts.some(
      (fact) => typeof fact !== "string" || !fact.trim(),
    )
  ) {
    errors.push("item_facts must contain at least 3 non-empty strings");
  }

  return errors;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!fs.existsSync(options.filePath)) {
    throw new Error(`Metadata file not found: ${options.filePath}`);
  }

  const envPath = path.resolve(__dirname, "../.env.local");
  const envText = fs.readFileSync(envPath, "utf8");
  const supabaseUrl =
    readEnv("NEXT_PUBLIC_SUPABASE_URL", envText) ||
    readEnv("SUPABASE_URL", envText);
  const supabaseKey = readEnv("SUPABASE_SECRET_KEY", envText);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase URL or SUPABASE_SECRET_KEY in .env.local",
    );
  }

  let records;
  try {
    records = JSON.parse(fs.readFileSync(options.filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse metadata JSON: ${error.message}`);
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Metadata JSON must be a non-empty array.");
  }

  const idIndexes = new Map();
  records.forEach((record, index) => {
    if (typeof record?.id !== "string") return;
    const id = record.id.toLowerCase();
    idIndexes.set(id, [...(idIndexes.get(id) ?? []), index]);
  });
  const duplicateIndexes = new Set(
    [...idIndexes.values()].filter((indexes) => indexes.length > 1).flat(),
  );

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const summary = { eligible: 0, skipped: 0, failed: 0, updated: 0 };

  console.log(`Mode: ${options.apply ? "APPLY" : "PREVIEW"}`);
  console.log(`Overwrite existing descriptions: ${options.overwrite ? "yes" : "no"}`);
  console.log(`Metadata file: ${path.relative(process.cwd(), options.filePath)}`);
  console.log(`Records: ${records.length}\n`);

  for (const [index, record] of records.entries()) {
    const label = record?.item_name || record?.id || `record ${index + 1}`;
    const validationErrors = validateRecord(record);
    if (duplicateIndexes.has(index)) {
      validationErrors.push(`duplicate UUID in metadata file: ${record.id}`);
    }
    if (validationErrors.length) {
      summary.failed++;
      console.error(`FAILED: ${label} — ${validationErrors.join("; ")}`);
      continue;
    }

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("auction_items")
        .select("id, topic, item_name, item_description")
        .eq("id", record.id)
        .maybeSingle();

      if (fetchError) throw new Error(`database lookup failed: ${fetchError.message}`);
      if (!existing) throw new Error(`unknown database UUID: ${record.id}`);
      if (existing.topic !== record.topic || existing.item_name !== record.item_name) {
        throw new Error(
          `identity mismatch for UUID ${record.id} (file: ${record.topic} / ${record.item_name}; database: ${existing.topic} / ${existing.item_name})`,
        );
      }

      if (existing.item_description?.trim() && !options.overwrite) {
        summary.skipped++;
        console.log(`SKIPPED: ${label} — description already exists (use --overwrite with --apply to replace)`);
        continue;
      }

      summary.eligible++;
      if (!options.apply) {
        console.log(`READY: ${label}`);
        continue;
      }

      let update = supabase
        .from("auction_items")
        .update({
          item_description: record.item_description,
          item_facts: record.item_facts,
        })
        .eq("id", record.id);

      if (!options.overwrite) {
        update = existing.item_description === null
          ? update.is("item_description", null)
          : update.eq("item_description", existing.item_description);
      }

      const { data: updated, error: updateError } = await update
        .select("id")
        .maybeSingle();
      if (updateError) throw new Error(`database update failed: ${updateError.message}`);
      if (!updated) {
        summary.eligible--;
        summary.skipped++;
        console.log(`SKIPPED: ${label} — record changed during import; no update made`);
        continue;
      }

      summary.updated++;
      console.log(`UPDATED: ${label}`);
    } catch (error) {
      summary.failed++;
      console.error(`FAILED: ${label} — ${error.message}`);
    }
  }

  console.log("\n----------------------------");
  console.log(`Eligible: ${summary.eligible}`);
  console.log(`Skipped:  ${summary.skipped}`);
  console.log(`Failed:   ${summary.failed}`);
  console.log(`Updated:  ${summary.updated}`);
  console.log(`Mode:     ${options.apply ? "APPLY" : "PREVIEW"}`);
  if (!options.apply) console.log("No database changes were made.");
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nIMPORT FAILED: ${error.message}`);
  process.exitCode = 1;
});
