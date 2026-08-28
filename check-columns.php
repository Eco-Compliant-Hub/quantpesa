foreach (DB::select('SHOW COLUMNS FROM users') as $c) {
    echo $c->Field . ' - ' . $c->Type . PHP_EOL;
}
echo '---' . PHP_EOL;
foreach (DB::select('SHOW COLUMNS FROM symbols') as $c) {
    echo $c->Field . ' - ' . $c->Type . PHP_EOL;
}
echo '---' . PHP_EOL;
echo DB::selectOne("SHOW TABLE STATUS LIKE 'users'")->Collation . PHP_EOL;
