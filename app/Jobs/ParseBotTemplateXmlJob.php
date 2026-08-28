<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

class ParseBotTemplateXmlJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected int $templateId;

    public function __construct(int $templateId)
    {
        $this->templateId = $templateId;
    }

    public function handle(): void
    {
        $template = DB::table('bot_templates')->where('id', $this->templateId)->first();

        if (!$template || empty($template->raw_xml)) {
            Log::warning("ParseBotTemplateXmlJob: template {$this->templateId} not found or has no raw_xml.");
            return;
        }

        // "_template_" in the filename keeps this from ever colliding with
        // ParseBotXmlJob's tmp_bot_{id}.xml -- a user_bots row and a
        // bot_templates row can share the same numeric id, and both jobs
        // could plausibly run in the same worker at the same moment.
        $tempPath = storage_path("app/tmp_bot_template_{$this->templateId}.xml");
        file_put_contents($tempPath, $template->raw_xml);

        $parserScript = base_path('bot_runtime/bot_engine/xml_parser.py');

        $process = new Process(['python', $parserScript, $tempPath]);
        $process->setTimeout(30);
        $process->run();

        // Clean up the temp file regardless of outcome.
        @unlink($tempPath);

        if (!$process->isSuccessful()) {
            // Deliberately not touching bot_templates.status here -- that
            // column's vocabulary is draft/tested/deployed/retracted, not
            // a parse-pipeline state. parsed_ast simply stays null; the
            // template is still usable for Test Run, it just won't have
            // structured data available for it yet.
            Log::error("ParseBotTemplateXmlJob: parser failed for template {$this->templateId}: " . $process->getErrorOutput());
            return;
        }

        $jsonOutput = $process->getOutput();

        $decoded = json_decode($jsonOutput, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error("ParseBotTemplateXmlJob: invalid JSON output for template {$this->templateId}: " . json_last_error_msg());
            return;
        }

        DB::table('bot_templates')->where('id', $this->templateId)->update([
            'parsed_ast' => $jsonOutput,
        ]);

        Log::info("ParseBotTemplateXmlJob: successfully parsed template {$this->templateId}.");
    }
}