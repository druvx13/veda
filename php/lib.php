<?php
declare(strict_types=1);

const VEDA_CONFIG = [
    'rik' => [
        'title' => 'ऋग्वेद (Rik)',
        'db' => 'rik_veda.sqlite',
        'table' => 'Rik',
        'levels' => ['मण्डलम्', 'सूक्तम्', 'मन्त्रः'],
    ],
    'yaju' => [
        'title' => 'यजुर्वेद (Yaju)',
        'db' => 'yaju_veda.sqlite',
        'table' => 'Yaju',
        'levels' => ['अध्याय', 'मन्त्रसंख्या'],
    ],
    'saam' => [
        'title' => 'सामवेद (Saam)',
        'db' => 'saam_veda.sqlite',
        'table' => 'Saam',
        'levels' => ['आर्चिकः', 'आर्चिकः दशति / सूक्त', 'आर्चिकः सूक्त मन्त्र'],
    ],
    'atharva' => [
        'title' => 'अथर्ववेद (Atharva)',
        'db' => 'atharva_veda.sqlite',
        'table' => 'Atharva',
        'levels' => ['काण्डः', 'सूक्तम्', 'मन्त्रः'],
    ],
];

const TITLE_KEYS = [
    'अध्याय.मन्त्रसंख्या', 'मन्त्र संख्या', 'मन्त्रसंख्या 1', '#',
    'काण्डः.सूक्तम्.मन्त्रः', 'मण्डलम्', 'सूक्तम्', 'मन्त्रः', 'क्रमसंख्या', 'क्रम संख्या', 'क्रमाङ्कः',
];

function h(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function qident(string $identifier): string
{
    return '"' . str_replace('"', '""', $identifier) . '"';
}

function current_veda(array $query): string
{
    $veda = isset($query['veda']) ? (string) $query['veda'] : 'rik';
    return isset(VEDA_CONFIG[$veda]) ? $veda : 'rik';
}

function open_veda_db(string $veda): PDO
{
    $config = VEDA_CONFIG[$veda];
    $root = dirname(__DIR__);
    $dbPath = $root . '/raw/sqls/individual/' . $config['db'];
    if (!is_file($dbPath)) {
        throw new RuntimeException('SQLite file not found: ' . $dbPath);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA journal_mode = OFF');
    $pdo->exec('PRAGMA synchronous = OFF');
    return $pdo;
}

/**
 * @return list<string>
 */
function table_columns(PDO $pdo, string $table): array
{
    $rows = $pdo->query('PRAGMA table_info(' . qident($table) . ')')->fetchAll();
    $columns = [];
    foreach ($rows as $row) {
        $columns[] = (string) $row['name'];
    }
    return $columns;
}

/**
 * @return array<string, string>
 */
function table_header_row(PDO $pdo, string $table, array $columns): array
{
    $query = 'SELECT ' . implode(', ', array_map('qident', $columns))
        . ' FROM ' . qident($table) . ' WHERE rowid > 1 ORDER BY rowid ASC LIMIT 1';
    $row = $pdo->query($query)->fetch();
    if (!$row) {
        return [];
    }
    $headers = [];
    foreach ($columns as $column) {
        $value = isset($row[$column]) ? trim((string) $row[$column]) : '';
        $headers[$column] = $value !== '' ? $value : $column;
    }
    return $headers;
}

/**
 * @return list<array{key:string,label:string,rawLabel:string}>
 */
function column_meta(array $columns, array $headers): array
{
    $seen = [];
    $meta = [];
    foreach ($columns as $column) {
        $raw = $headers[$column] ?? $column;
        $n = ($seen[$raw] ?? 0) + 1;
        $seen[$raw] = $n;
        $label = $n > 1 ? ($raw . ' (' . $n . ')') : $raw;
        $meta[] = ['key' => $column, 'label' => $label, 'rawLabel' => $raw];
    }
    return $meta;
}

function find_key_for_label(array $meta, string $label): ?string
{
    foreach ($meta as $entry) {
        if ($entry['rawLabel'] === $label) {
            return $entry['key'];
        }
    }
    return null;
}

/**
 * @return list<string>
 */
function enabled_fields(array $query, array $meta): array
{
    $enabled = isset($query['af']) && (string) $query['af'] === '1';
    if (!$enabled) {
        return array_map(static fn(array $entry): string => $entry['key'], $meta);
    }

    $allowed = array_flip(array_map(static fn(array $entry): string => $entry['key'], $meta));
    $raw = isset($query['fields']) && is_array($query['fields']) ? $query['fields'] : [];
    $out = [];
    foreach ($raw as $candidate) {
        $candidate = (string) $candidate;
        if (isset($allowed[$candidate])) {
            $out[] = $candidate;
        }
    }
    return $out !== [] ? array_values(array_unique($out)) : array_map(static fn(array $entry): string => $entry['key'], $meta);
}

function selected_levels(array $query, array $levelKeys): array
{
    $selected = [];
    foreach ($levelKeys as $index => $_) {
        $param = 's' . ($index + 1);
        $selected[] = isset($query[$param]) ? trim((string) $query[$param]) : '';
    }
    return $selected;
}

/**
 * @return array{sql:string,params:array<string,mixed>}
 */
function where_clause(string $table, array $meta, array $levelLabels, array $levelValues, string $search, array $searchFields): array
{
    $clauses = ['rowid > 1'];
    $params = [];

    foreach ($levelLabels as $index => $label) {
        $value = $levelValues[$index] ?? '';
        if ($value === '') {
            continue;
        }
        $key = find_key_for_label($meta, $label);
        if ($key === null) {
            continue;
        }
        $param = ':lvl' . $index;
        $clauses[] = qident($key) . ' = ' . $param;
        $params[$param] = $value;
    }

    if ($search !== '' && $searchFields !== []) {
        $likeClauses = [];
        $params[':search'] = '%' . mb_strtolower($search, 'UTF-8') . '%';
        foreach ($searchFields as $fieldKey) {
            $likeClauses[] = 'LOWER(COALESCE(CAST(' . qident($fieldKey) . ' AS TEXT), \'\')) LIKE :search';
        }
        $clauses[] = '(' . implode(' OR ', $likeClauses) . ')';
    }

    return [
        'sql' => ' FROM ' . qident($table) . ' WHERE ' . implode(' AND ', $clauses),
        'params' => $params,
    ];
}

/**
 * @return list<string>
 */
function selector_options(PDO $pdo, string $table, array $meta, array $levelLabels, array $selected, int $levelIndex): array
{
    $label = $levelLabels[$levelIndex];
    $key = find_key_for_label($meta, $label);
    if ($key === null) {
        return [];
    }

    $clauses = ['rowid > 1'];
    $params = [];
    for ($i = 0; $i < $levelIndex; $i++) {
        $v = $selected[$i] ?? '';
        if ($v === '') {
            return [];
        }
        $prevKey = find_key_for_label($meta, $levelLabels[$i]);
        if ($prevKey === null) {
            return [];
        }
        $param = ':p' . $i;
        $clauses[] = qident($prevKey) . ' = ' . $param;
        $params[$param] = $v;
    }

    $sql = 'SELECT DISTINCT TRIM(CAST(' . qident($key) . ' AS TEXT)) AS value'
        . ' FROM ' . qident($table)
        . ' WHERE ' . implode(' AND ', $clauses)
        . ' AND TRIM(CAST(' . qident($key) . ' AS TEXT)) <> \'\''
        . ' ORDER BY value COLLATE NOCASE';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        $out[] = (string) $row['value'];
    }
    return $out;
}

function row_title(array $row, array $meta, int $fallbackIndex): string
{
    foreach (TITLE_KEYS as $titleKey) {
        $schemaKey = find_key_for_label($meta, $titleKey);
        if ($schemaKey === null) {
            continue;
        }
        $value = isset($row[$schemaKey]) ? trim((string) $row[$schemaKey]) : '';
        if ($value !== '') {
            return $titleKey . ': ' . $value;
        }
    }
    return 'Record ' . $fallbackIndex;
}

/**
 * @return string
 */
function query_without(array $query, array $removeKeys): string
{
    foreach ($removeKeys as $key) {
        unset($query[$key]);
    }
    return http_build_query($query);
}
