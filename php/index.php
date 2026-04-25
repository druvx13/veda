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

$levelLabels = $config['levels'];
$selected = selected_levels($_GET, $levelLabels);
$search = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
$pageSize = max(10, min(100, (int) ($_GET['pageSize'] ?? 20)));
$page = max(1, (int) ($_GET['page'] ?? 1));
$displayFields = enabled_fields($_GET, $meta);

$where = where_clause($table, $meta, $levelLabels, $selected, $search, $displayFields);
$countStmt = $pdo->prepare('SELECT COUNT(*)' . $where['sql']);
$countStmt->execute($where['params']);
$total = (int) $countStmt->fetchColumn();
$totalPages = max(1, (int) ceil($total / $pageSize));
if ($page > $totalPages) {
    $page = $totalPages;
}
$offset = ($page - 1) * $pageSize;

$selectCols = implode(', ', array_merge(['rowid AS __rid'], array_map('qident', $columns)));
$rowsStmt = $pdo->prepare(
    'SELECT ' . $selectCols . $where['sql']
    . ' ORDER BY rowid ASC LIMIT :limit OFFSET :offset'
);
foreach ($where['params'] as $key => $value) {
    $rowsStmt->bindValue($key, $value);
}
$rowsStmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
$rowsStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$rowsStmt->execute();
$rows = $rowsStmt->fetchAll();

$baseQuery = $_GET;
unset($baseQuery['page']);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>VedaKosh — Four Vedas (PHP)</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="topbar">
    <div>
      <h1>VedaKosh — Four Vedas</h1>
      <p class="subtitle">PHP + SQLite index of Sanskrit text, translations, and metadata</p>
    </div>
  </header>

  <main class="container">
    <section class="controls">
      <div class="veda-switch">
        <?php foreach (VEDA_CONFIG as $key => $vedaItem): ?>
          <?php $q = $_GET; $q['veda'] = $key; unset($q['page']); ?>
          <a class="veda-btn <?= $key === $veda ? 'active' : '' ?>" href="?<?= h(http_build_query($q)) ?>"><?= h($vedaItem['title']) ?></a>
        <?php endforeach; ?>
      </div>

      <form method="get" class="selector-panel">
        <input type="hidden" name="veda" value="<?= h($veda) ?>" />
        <h2 class="selector-title">वांछित मन्त्र चुनें! / Choose desired mantra</h2>
        <div class="hierarchy-grid">
          <?php foreach ($levelLabels as $index => $level): ?>
            <?php $param = 's' . ($index + 1); $options = selector_options($pdo, $table, $meta, $levelLabels, $selected, $index); ?>
            <div>
              <label class="selector-label" for="<?= h($param) ?>"><?= h($level) ?></label>
              <select class="selector-input" id="<?= h($param) ?>" name="<?= h($param) ?>">
                <option value="">Select...</option>
                <?php foreach ($options as $option): ?>
                  <option value="<?= h($option) ?>" <?= ($selected[$index] ?? '') === $option ? 'selected' : '' ?>><?= h($option) ?></option>
                <?php endforeach; ?>
              </select>
            </div>
          <?php endforeach; ?>
        </div>

        <section class="selector-panel">
          <h2 class="selector-title">Advanced content filter</h2>
          <p class="filter-note">Enable to limit visible/searchable fields.</p>
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
        </section>

        <div class="toolbar">
          <input type="search" name="q" value="<?= h($search) ?>" placeholder="Search across visible Veda data..." aria-label="Search" />
          <select name="pageSize" aria-label="Page size">
            <?php foreach ([10, 20, 50, 100] as $size): ?>
              <option value="<?= $size ?>" <?= $size === $pageSize ? 'selected' : '' ?>><?= $size ?> / page</option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="advanced-actions" style="margin-top:.6rem">
          <button type="submit">Apply</button>
          <a class="nav-btn" href="?veda=<?= h($veda) ?>">Reset</a>
        </div>
      </form>

      <div class="meta">
        <?= h($config['title']) ?> · <?= number_format($total) ?> matches
      </div>
    </section>

    <section class="results">
      <?php foreach ($rows as $index => $row): ?>
        <?php $rid = (int) ($row['__rid'] ?? 0); ?>
        <article class="record-card">
          <h3 class="record-title"><?= h(row_title($row, $meta, $offset + $index + 1)) ?></h3>
          <?php $q = $_GET; $q['rid'] = $rid; ?>
          <a class="record-link" href="verse.php?<?= h(http_build_query($q)) ?>">Open dedicated verse page</a>
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
      <?php endforeach; ?>
    </section>

    <nav class="pagination">
      <?php if ($page > 1): ?>
        <?php $q = $baseQuery; $q['page'] = $page - 1; ?>
        <a class="nav-btn" href="?<?= h(http_build_query($q)) ?>">← Prev</a>
      <?php else: ?>
        <span class="nav-btn disabled">← Prev</span>
      <?php endif; ?>

      <span>Page <?= h((string) $page) ?> / <?= h((string) $totalPages) ?></span>

      <?php if ($page < $totalPages): ?>
        <?php $q = $baseQuery; $q['page'] = $page + 1; ?>
        <a class="nav-btn" href="?<?= h(http_build_query($q)) ?>">Next →</a>
      <?php else: ?>
        <span class="nav-btn disabled">Next →</span>
      <?php endif; ?>
    </nav>
  </main>
</body>
</html>
