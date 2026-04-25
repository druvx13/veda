<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$veda = current_veda($_GET);
$config = VEDA_CONFIG[$veda];
$table = $config['table'];

$pdo = open_veda_db($veda);
$columns = table_columns($pdo, $table);
$headers = table_header_row($pdo, $table, $columns);
$meta = column_meta($columns, $headers);
$displayFields = enabled_fields($_GET, $meta);
$rid = max(2, (int) ($_GET['rid'] ?? 2));

$selectCols = implode(', ', array_merge(['rowid AS __rid'], array_map('qident', $columns)));
$rowStmt = $pdo->prepare('SELECT ' . $selectCols . ' FROM ' . qident($table) . ' WHERE rowid = :rid AND rowid > 1 LIMIT 1');
$rowStmt->bindValue(':rid', $rid, PDO::PARAM_INT);
$rowStmt->execute();
$row = $rowStmt->fetch();

if (!$row) {
    $fallbackStmt = $pdo->query('SELECT ' . $selectCols . ' FROM ' . qident($table) . ' WHERE rowid > 1 ORDER BY rowid ASC LIMIT 1');
    $row = $fallbackStmt->fetch() ?: [];
    $rid = (int) ($row['__rid'] ?? 2);
}

$prevStmt = $pdo->prepare('SELECT rowid FROM ' . qident($table) . ' WHERE rowid > 1 AND rowid < :rid ORDER BY rowid DESC LIMIT 1');
$prevStmt->bindValue(':rid', $rid, PDO::PARAM_INT);
$prevStmt->execute();
$prevRid = $prevStmt->fetchColumn();

$nextStmt = $pdo->prepare('SELECT rowid FROM ' . qident($table) . ' WHERE rowid > 1 AND rowid > :rid ORDER BY rowid ASC LIMIT 1');
$nextStmt->bindValue(':rid', $rid, PDO::PARAM_INT);
$nextStmt->execute();
$nextRid = $nextStmt->fetchColumn();

$backQuery = $_GET;
unset($backQuery['rid']);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>VedaKosh — Verse (PHP)</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="topbar">
    <div>
      <h1><?= h($config['title']) ?></h1>
      <p class="subtitle">Dedicated verse page (PHP + SQLite)</p>
    </div>
  </header>

  <main class="container">
    <div class="verse-toolbar">
      <a class="nav-btn" href="index.php?<?= h(http_build_query($backQuery)) ?>">← Back to index</a>
      <div class="verse-nav">
        <?php if ($prevRid !== false): ?>
          <?php $q = $_GET; $q['rid'] = (int) $prevRid; ?>
          <a class="nav-btn" href="?<?= h(http_build_query($q)) ?>">← Previous</a>
        <?php else: ?>
          <span class="nav-btn disabled">← Previous</span>
        <?php endif; ?>
        <?php if ($nextRid !== false): ?>
          <?php $q = $_GET; $q['rid'] = (int) $nextRid; ?>
          <a class="nav-btn" href="?<?= h(http_build_query($q)) ?>">Next →</a>
        <?php else: ?>
          <span class="nav-btn disabled">Next →</span>
        <?php endif; ?>
      </div>
    </div>

    <form method="get" class="selector-panel">
      <input type="hidden" name="veda" value="<?= h($veda) ?>" />
      <input type="hidden" name="rid" value="<?= h((string) $rid) ?>" />
      <h2 class="selector-title">Advanced content filter</h2>
      <p class="filter-note">Enable to limit displayed fields for this verse.</p>
      <label class="advanced-toggle">
        <input type="checkbox" name="af" value="1" <?= (($_GET['af'] ?? '') === '1') ? 'checked' : '' ?> />
        <span>Enable advanced content filter</span>
      </label>
      <div class="advanced-list">
        <?php foreach ($meta as $entry): ?>
          <label class="advanced-item">
            <input type="checkbox" name="fields[]" value="<?= h($entry['key']) ?>" <?= in_array($entry['key'], $displayFields, true) ? 'checked' : '' ?> />
            <span><?= h($entry['label']) ?></span>
          </label>
        <?php endforeach; ?>
      </div>
      <div class="advanced-actions" style="margin-top:.6rem">
        <button type="submit">Apply</button>
      </div>
    </form>

    <article class="record-card" id="verseCard">
      <h2 class="record-title"><?= h(row_title($row, $meta, max(1, $rid - 1))) ?></h2>
      <dl class="record-fields">
        <?php foreach ($meta as $entry): ?>
          <?php if (!in_array($entry['key'], $displayFields, true)) { continue; } ?>
          <?php $value = isset($row[$entry['key']]) ? trim((string) $row[$entry['key']]) : ''; ?>
          <div>
            <dt><?= h($entry['label']) ?></dt>
            <dd><?= h($value !== '' ? $value : '—') ?></dd>
          </div>
        <?php endforeach; ?>
      </dl>
    </article>
  </main>
</body>
</html>
