<?php
declare(strict_types=1);

function deploymentCheck(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
function deploymentPath(string $root, string $relative): string {
    deploymentCheck($relative !== '' && !str_contains($relative, '\\') && !str_contains($relative, "\0"), 'Invalid relative path.');
    $path = $root;
    foreach (explode('/', $relative) as $part) {
        deploymentCheck($part !== '' && $part !== '.' && $part !== '..', 'Path traversal rejected.');
        $path .= '/' . $part;
        deploymentCheck(!is_link($path), 'Deployment cannot traverse symbolic links.');
    }
    return $path;
}
function deploymentCopy(string $from, string $to): void {
    $directory = dirname($to);
    if (!is_dir($directory)) deploymentCheck(mkdir($directory, 0755, true), 'Cannot create destination directory.');
    $temporary = tempnam($directory, '.duel-');
    deploymentCheck($temporary !== false, 'Cannot create temporary file.');
    try {
        deploymentCheck(copy($from, $temporary), 'File copy failed.');
        chmod($temporary, 0644);
        deploymentCheck(rename($temporary, $to), 'File replacement failed.');
    } finally { if (is_file($temporary)) unlink($temporary); }
}
function deployRelease(string $root, string $archive, string $id, string $commit, string $url, ?callable $activeCheck = null, ?callable $health = null): void {
    $root = realpath($root) ?: '';
    deploymentCheck($root !== '' && dirname($root) !== $root, 'Invalid domain directory.');
    $marker = deploymentPath($root, '.duel-deploy-enabled');
    deploymentCheck(is_file($marker) && trim(file_get_contents($marker)) === 'DUEL8020', 'Missing domain deployment marker.');
    deploymentCheck((bool) preg_match('/^[a-f0-9]{40}-[0-9]+-[0-9]+$/D', $id), 'Invalid release ID.');
    deploymentCheck((bool) preg_match('/^[a-f0-9]{40}$/D', $commit), 'Invalid commit.');
    deploymentCheck((bool) preg_match('~^https://[a-zA-Z0-9.-]+/?$~D', $url), 'HTTPS domain URL required.');
    $configPath = deploymentPath($root, 'server/config.php');
    deploymentCheck(is_file($configPath), 'Create private config.php and initialize the database first.');
    $existingApi = deploymentPath($root, 'public_html/api/index.php');
    deploymentCheck(!is_file($existingApi) || str_contains(file_get_contents($existingApi), '.duel-maintenance'), 'Install the maintenance-aware API entrypoint once before enabling CD.');
    $control = deploymentPath($root, '.deploy');
    if (!is_dir($control)) mkdir($control, 0700);
    $lock = fopen(deploymentPath($root, '.deploy/lock'), 'c');
    deploymentCheck($lock !== false && flock($lock, LOCK_EX | LOCK_NB), 'Another deployment is running.');
    $flag = deploymentPath($root, 'public_html/.duel-maintenance');
    $ownedFlag = false; $applied = []; $backups = [];
    $workspace = deploymentPath($root, '.deploy/releases/' . $id);
    try {
        deploymentCheck(!file_exists($workspace), 'This release was already attempted. Use a new run attempt.');
        mkdir($workspace, 0700, true);
        $zip = new ZipArchive();
        deploymentCheck($zip->open($archive) === true, 'Cannot open the tested artifact.');
        $files = []; $total = 0;
        try {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $entry = $zip->statIndex($i); $name = $entry['name'];
                deploymentCheck(is_string($name), 'Invalid archive entry.');
                $relative = rtrim($name, '/'); deploymentPath($workspace, $relative);
                $zip->getExternalAttributesIndex($i, $os, $attributes);
                deploymentCheck((($attributes >> 16) & 0170000) !== 0120000, 'Archive symlink rejected.');
                $total += $entry['size']; deploymentCheck($total < 100 * 1024 * 1024, 'Artifact exceeds extraction limit.');
                deploymentCheck(!in_array($relative, ['server/config.php','server/config.test.php','public_html/.duel-maintenance'], true), 'Private configuration or maintenance marker in artifact.');
                deploymentCheck((bool) preg_match('~^(public_html|server|documentation)(/|$)|^(BUILD.json|FLAG-ICONS-LICENSE.txt)$~D', $relative), 'Unexpected artifact root.');
                if (str_ends_with($name, '/')) continue;
                deploymentCheck(!isset($files[$name]), 'Duplicate archive path.');
                $destination = deploymentPath($workspace, 'staged/' . $name);
                if (!is_dir(dirname($destination))) mkdir(dirname($destination), 0700, true);
                $bytes = $zip->getFromIndex($i);
                deploymentCheck($bytes !== false && file_put_contents($destination, $bytes) !== false, 'Archive extraction failed.');
                $files[$name] = $destination;
            }
        } finally { $zip->close(); }
        foreach (['BUILD.json','public_html/index.html','public_html/api/index.php','server/bootstrap.php','server/data/80_20_difficult.policy.json'] as $required) deploymentCheck(isset($files[$required]), 'Incomplete artifact.');
        $build = json_decode(file_get_contents($files['BUILD.json']), true, 512, JSON_THROW_ON_ERROR);
        deploymentCheck(($build['commit'] ?? null) === $commit, 'Artifact does not match the tested commit.');
        deploymentCheck(str_contains(file_get_contents($files['public_html/api/index.php']), '.duel-maintenance'), 'Release lacks maintenance guard.');
        $managed = array_filter(array_keys($files), fn($p) => str_starts_with($p,'public_html/') || str_starts_with($p,'server/'));
        foreach ($managed as $relative) {
            $target = deploymentPath($root, $relative);
            deploymentCheck(!is_dir($target), 'File target is a directory.');
            if (is_file($target)) {
                $backup = deploymentPath($workspace, 'backup/' . $relative);
                deploymentCopy($target, $backup); $backups[$relative] = $backup;
            }
        }
        $handle = @fopen($flag, 'x'); deploymentCheck($handle !== false, 'Maintenance is already active.');
        fclose($handle); $ownedFlag = true;
        if ($activeCheck) $activeCheck();
        else {
            $config = require $configPath;
            $db = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            if (($build['schemaVersion'] ?? 1) >= 2) {
                foreach (['presence','match_offers','rematches'] as $table) $db->query("SELECT 1 FROM $table LIMIT 0");
            }
            $active = (int) $db->query("SELECT COUNT(*) FROM matches WHERE mode='multi' AND status='active'")->fetchColumn();
            deploymentCheck($active === 0, 'Multiplayer games are active. Retry after they finish or expire via cron.');
        }
        usort($managed, function($a,$b) {
            $priority = fn($p) => $p === 'public_html/index.html' ? 3 : (str_starts_with($p,'server/') ? 0 : 1);
            return $priority($a) <=> $priority($b);
        });
        foreach ($managed as $relative) {
            $applied[] = $relative;
            deploymentCopy($files[$relative], deploymentPath($root, $relative));
        }
        unlink($flag); $ownedFlag = false;
        if ($health) $health();
        else {
            $curl = curl_init(rtrim($url,'/') . '/api/index.php?route=session');
            curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>20, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_FOLLOWLOCATION=>false]);
            $body = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
            $json = json_decode(is_string($body) ? $body : '', true);
            deploymentCheck($status === 200 && isset($json['data']['csrf']) && array_key_exists('user', $json['data']) && $json['data']['user'] === null, 'Post-deploy API health check failed.');
        }
        file_put_contents($control . '/current.json', json_encode(['release'=>$id,'commit'=>$commit,'deployedAt'=>gmdate('c')], JSON_PRETTY_PRINT));
        echo "Deployment healthy: $commit\n";
    } catch (Throwable $error) {
        if ($applied) {
            if (!$ownedFlag) { file_put_contents($flag, 'rollback'); $ownedFlag = true; }
            try {
                foreach (array_reverse($applied) as $relative) {
                    $target = deploymentPath($root, $relative);
                    if (isset($backups[$relative])) deploymentCopy($backups[$relative], $target);
                    elseif (is_file($target)) unlink($target);
                }
                echo "Previous application files restored. Database and config.php were not changed.\n";
            } catch (Throwable $rollbackError) {
                // Keep the flag if automatic restoration cannot finish.
                $ownedFlag = false;
                throw new RuntimeException('Rollback incomplete: maintenance remains active; restore the private backup manually.', 0, $rollbackError);
            }
        }
        throw $error;
    } finally {
        if ($ownedFlag && is_file($flag)) unlink($flag);
        flock($lock, LOCK_UN); fclose($lock);
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    try {
        deploymentCheck($argc === 6, 'Expected root, archive, release ID, commit and HTTPS URL.');
        deployRelease($argv[1],$argv[2],$argv[3],$argv[4],$argv[5]);
    } catch (Throwable $e) {
        // Connection exceptions can contain infrastructure details; keep them out of Actions logs.
        fwrite(STDERR, $e instanceof PDOException ? "Database preflight failed; check private server configuration.\n" : $e->getMessage() . "\n");
        exit(1);
    }
}
