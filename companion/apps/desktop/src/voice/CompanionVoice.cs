using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;
using Windows.Media.SpeechSynthesis;

public static class CompanionVoice
{
    private static readonly object WriteLock = new object();

    private static void Emit(string json)
    {
        lock (WriteLock)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }
    }

    private static string Esc(string value)
    {
        if (value == null) return "";
        var sb = new StringBuilder(value.Length + 16);
        foreach (var ch in value)
        {
            switch (ch)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
                    else sb.Append(ch);
                    break;
            }
        }
        return sb.ToString();
    }

    private static string FailureCode(string message)
    {
        var text = (message ?? "").ToLowerInvariant();
        if (text.Contains("privacy")) return text.Contains("microphone") ? "microphone_privacy" : "speech_privacy";
        if (text.Contains("no audio") || text.Contains("input device") || text.Contains("microphone")) return "no_microphone";
        if (text.Contains("not installed") || text.Contains("not found")) return "not_installed";
        return "unknown";
    }

    private static void Error(string message)
    {
        Emit("{\"event\":\"error\",\"message\":\"" + Esc(message) + "\",\"code\":\"" + FailureCode(message) + "\"}");
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                Error("missing_mode");
                return 2;
            }
            switch (args[0].ToLowerInvariant())
            {
                case "voices":
                    ListVoices();
                    return 0;
                case "speak":
                    Speak(args);
                    return 0;
                case "listen":
                    ListenWinRt(args).GetAwaiter().GetResult();
                    return 0;
                case "listen-sapi":
                    ListenSapi(args);
                    return 0;
                case "synthesize":
                    Synthesize(args);
                    return 0;
                case "recognize-file":
                    RecognizeFile(args);
                    return 0;
                default:
                    Error("unknown_mode:" + args[0]);
                    return 2;
            }
        }
        catch (Exception ex)
        {
            Error(ex.GetType().Name + ": " + ex.Message);
            return 3;
        }
    }

    private static void ListVoices()
    {
        var voices = new List<string>();
        foreach (var voice in SpeechSynthesizer.AllVoices)
        {
            voices.Add("{\"name\":\"" + Esc(voice.DisplayName) + "\",\"language\":\"" + Esc(voice.Language) + "\",\"id\":\"" + Esc(voice.Id) + "\",\"gender\":\"" + Esc(voice.Gender.ToString()) + "\"}");
        }
        var languages = new List<string>();
        try
        {
            foreach (var language in SpeechRecognizer.SupportedTopicLanguages)
            {
                languages.Add("{\"tag\":\"" + Esc(language.LanguageTag) + "\",\"name\":\"" + Esc(language.DisplayName) + "\"}");
            }
        }
        catch { }
        Emit("{\"event\":\"voices\",\"synthesis\":[" + string.Join(",", voices.ToArray()) + "],\"recognition_languages\":[" + string.Join(",", languages.ToArray()) + "]}");
    }

    private static void AddEventHandler(Type projectedType, object instance, string eventName, Delegate handler)
    {
        // .NET Framework cannot see WinRT add_* events through the projection,
        // so bind them by reflection.
        var method = projectedType.GetMethod("add_" + eventName);
        if (method == null) throw new InvalidOperationException("event_not_found:" + eventName);
        method.Invoke(instance, new object[] { handler });
    }

    private static bool LooksNeural(VoiceInformation voice)
    {
        if (voice == null) return false;
        var name = (voice.DisplayName ?? "") + " " + (voice.Id ?? "");
        var lower = name.ToLowerInvariant();
        return lower.Contains("neural") || lower.Contains("natural") || lower.Contains("online") || lower.Contains("onecore");
    }

    private static SpeechSynthesizer FindVoice(string selector)
    {
        var synth = new SpeechSynthesizer();
        if (!string.IsNullOrWhiteSpace(selector))
        {
            var wanted = selector.Trim();
            foreach (var voice in SpeechSynthesizer.AllVoices)
            {
                if (string.Equals(voice.DisplayName, wanted, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(voice.Id, wanted, StringComparison.OrdinalIgnoreCase) ||
                    voice.DisplayName.IndexOf(wanted, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    synth.Voice = voice;
                    return synth;
                }
            }
            return synth;
        }
        // Prefer neural / online / OneCore voices when the owner left selector empty.
        VoiceInformation preferred = null;
        foreach (var voice in SpeechSynthesizer.AllVoices)
        {
            var lang = (voice.Language ?? "").ToLowerInvariant();
            if (!lang.StartsWith("en")) continue;
            if (LooksNeural(voice))
            {
                preferred = voice;
                break;
            }
            if (preferred == null) preferred = voice;
        }
        if (preferred != null) synth.Voice = preferred;
        return synth;
    }

    private static byte[] BuildSsml(string text, int rate, int pitch, out string language)
    {
        language = "en-US";
        var ratePercent = (int)Math.Round((1.0 + rate / 10.0) * 100.0);
        if (ratePercent < 50) ratePercent = 50;
        if (ratePercent > 250) ratePercent = 250;
        var pitchPercent = (int)Math.Round((1.0 + pitch / 20.0) * 100.0);
        if (pitchPercent < 50) pitchPercent = 50;
        if (pitchPercent > 200) pitchPercent = 200;
        // Mild sentence-level pauses + slight pitch contour for more natural speech.
        var parts = System.Text.RegularExpressions.Regex.Split(text ?? "", @"(?<=[\.!\?])\s+");
        var body = new StringBuilder();
        for (var i = 0; i < parts.Length; i++)
        {
            var sentence = (parts[i] ?? "").Trim();
            if (sentence.Length == 0) continue;
            var escaped = System.Security.SecurityElement.Escape(sentence);
            var contour = (i % 2 == 0) ? pitchPercent : Math.Max(50, Math.Min(200, pitchPercent + 3));
            body.Append("<prosody rate=\"").Append(ratePercent).Append("%\" pitch=\"").Append(contour).Append("%\">")
                .Append(escaped)
                .Append("</prosody>");
            if (i < parts.Length - 1) body.Append("<break time=\"220ms\"/>");
        }
        if (body.Length == 0)
        {
            var escaped = System.Security.SecurityElement.Escape(text ?? "");
            body.Append("<prosody rate=\"").Append(ratePercent).Append("%\" pitch=\"").Append(pitchPercent).Append("%\">")
                .Append(escaped)
                .Append("</prosody>");
        }
        var ssml = "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"" + language + "\">" + body + "</speak>";
        return Encoding.UTF8.GetBytes(ssml);
    }

    private static void Speak(string[] args)
    {
        var encoded = args.Length > 1 ? args[1] : "";
        var text = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
        var voiceSelector = args.Length > 2 ? args[2] : "";
        var rate = 0;
        if (args.Length > 3) int.TryParse(args[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out rate);
        var pitch = 0;
        if (args.Length > 4) int.TryParse(args[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out pitch);
        var engine = args.Length > 5 ? args[5].ToLowerInvariant() : "auto";
        rate = Math.Max(-10, Math.Min(10, rate));
        pitch = Math.Max(-10, Math.Min(10, pitch));
        if (string.IsNullOrWhiteSpace(text)) { Emit("{\"event\":\"speech_done\"}"); return; }

        if (engine != "sapi")
        {
            try
            {
                SpeakWinRt(text, voiceSelector, rate, pitch).GetAwaiter().GetResult();
                return;
            }
            catch (Exception ex)
            {
                if (engine == "winrt")
                {
                    Error("speak_failed:" + ex.Message);
                    return;
                }
                Emit("{\"event\":\"fallback\",\"engine\":\"sapi\",\"message\":\"" + Esc(ex.Message) + "\"}");
            }
        }
        SpeakSapi(text, voiceSelector, rate);
    }

    private static async Task SpeakWinRt(string text, string voiceSelector, int rate, int pitch)
    {
        var synth = FindVoice(voiceSelector);
        string language;
        var ssml = Encoding.UTF8.GetString(BuildSsml(text, rate, pitch, out language));
        SpeechSynthesisStream stream = null;
        try
        {
            stream = await synth.SynthesizeSsmlToStreamAsync(ssml);
        }
        catch
        {
            stream = null;
        }
        if (stream == null)
        {
            stream = await synth.SynthesizeTextToStreamAsync(text);
        }
        var temp = Path.Combine(Path.GetTempPath(), "companion-tts-" + Guid.NewGuid().ToString("N") + ".wav");
        try
        {
            using (var input = stream.AsStreamForRead())
            using (var output = File.Create(temp))
            {
                input.CopyTo(output);
            }
            Emit("{\"event\":\"speech_started\",\"engine\":\"winrt\",\"voice\":\"" + Esc(synth.Voice != null ? synth.Voice.DisplayName : "") + "\"}");
            using (var player = new System.Media.SoundPlayer(temp))
            {
                player.PlaySync();
            }
            Emit("{\"event\":\"speech_done\"}");
        }
        finally
        {
            try { File.Delete(temp); } catch { }
            if (stream != null) stream.Dispose();
            synth.Dispose();
        }
    }

    private static void SpeakSapi(string text, string voiceSelector, int rate)
    {
        using (var synth = new System.Speech.Synthesis.SpeechSynthesizer())
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(voiceSelector))
                {
                    try { synth.SelectVoice(voiceSelector.Trim()); }
                    catch
                    {
                        foreach (var voice in synth.GetInstalledVoices())
                        {
                            if (voice.VoiceInfo.Name.IndexOf(voiceSelector.Trim(), StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                synth.SelectVoice(voice.VoiceInfo.Name);
                                break;
                            }
                        }
                    }
                }
                synth.Rate = rate;
                Emit("{\"event\":\"speech_started\",\"engine\":\"sapi\",\"voice\":\"" + Esc(synth.Voice != null ? synth.Voice.Name : "") + "\"}");
                synth.Speak(text);
                Emit("{\"event\":\"speech_done\"}");
            }
            catch (Exception ex)
            {
                Error("speak_failed:" + ex.Message);
            }
        }
    }

    private static async Task ListenWinRt(string[] args)
    {
        var languageTag = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : "en-US";
        SpeechRecognizer recognizer;
        try
        {
            recognizer = new SpeechRecognizer(new Language(languageTag));
        }
        catch
        {
            recognizer = new SpeechRecognizer();
        }
        recognizer.Constraints.Add(new SpeechRecognitionTopicConstraint(SpeechRecognitionScenario.Dictation, "dictation"));
        var compilation = await recognizer.CompileConstraintsAsync();
        if (compilation.Status != SpeechRecognitionResultStatus.Success)
        {
            Error("constraint_compilation_failed:" + compilation.Status);
            try { recognizer.Dispose(); } catch { }
            return;
        }
        var session = recognizer.ContinuousRecognitionSession;
        AddEventHandler(
            typeof(SpeechContinuousRecognitionSession),
            session,
            "ResultGenerated",
            new Windows.Foundation.TypedEventHandler<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionResultGeneratedEventArgs>(
                (sender, eventArgs) =>
                {
                    var result = eventArgs.Result;
                    if (result == null) return;
                    Emit("{\"event\":\"result_status\",\"status\":\"" + result.Status + "\"}");
                    if (string.IsNullOrWhiteSpace(result.Text)) return;
                    Emit("{\"event\":\"result\",\"text\":\"" + Esc(result.Text) + "\",\"confidence\":\"" + result.Confidence + "\"}");
                }));
        AddEventHandler(
            typeof(SpeechRecognizer),
            recognizer,
            "HypothesisGenerated",
            new Windows.Foundation.TypedEventHandler<SpeechRecognizer, SpeechRecognitionHypothesisGeneratedEventArgs>(
                (sender, eventArgs) =>
                {
                    var hypothesis = eventArgs.Hypothesis;
                    if (hypothesis == null || string.IsNullOrWhiteSpace(hypothesis.Text)) return;
                    Emit("{\"event\":\"hypothesis\",\"text\":\"" + Esc(hypothesis.Text) + "\"}");
                }));
        AddEventHandler(
            typeof(SpeechContinuousRecognitionSession),
            session,
            "Completed",
            new Windows.Foundation.TypedEventHandler<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionCompletedEventArgs>(
                (sender, eventArgs) =>
                {
                    Emit("{\"event\":\"completed\",\"status\":\"" + eventArgs.Status + "\"}");
                }));
        AddEventHandler(
            typeof(SpeechRecognizer),
            recognizer,
            "StateChanged",
            new Windows.Foundation.TypedEventHandler<SpeechRecognizer, SpeechRecognizerStateChangedEventArgs>(
                (sender, eventArgs) =>
                {
                    Emit("{\"event\":\"recognizer_state\",\"state\":\"" + eventArgs.State + "\"}");
                }));
        AddEventHandler(
            typeof(SpeechRecognizer),
            recognizer,
            "RecognitionQualityDegrading",
            new Windows.Foundation.TypedEventHandler<SpeechRecognizer, SpeechRecognitionQualityDegradingEventArgs>(
                (sender, eventArgs) =>
                {
                    Emit("{\"event\":\"quality\",\"problem\":\"" + eventArgs.Problem + "\"}");
                }));
        try
        {
            await session.StartAsync();
        }
        catch (Exception ex)
        {
            Error("start_failed:" + ex.Message);
            try { recognizer.Dispose(); } catch { }
            return;
        }
        Emit("{\"event\":\"ready\",\"engine\":\"winrt\",\"language\":\"" + Esc(languageTag) + "\"}");
        WaitForStop();
        try { await session.StopAsync(); } catch { }
        try { recognizer.Dispose(); } catch { }
        Emit("{\"event\":\"stopped\"}");
    }

    private static void ListenSapi(string[] args)
    {
        var languageTag = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : "en-US";
        System.Speech.Recognition.SpeechRecognitionEngine engine;
        try
        {
            engine = new System.Speech.Recognition.SpeechRecognitionEngine(new CultureInfo(languageTag));
        }
        catch
        {
            engine = new System.Speech.Recognition.SpeechRecognitionEngine();
        }
        try
        {
            engine.LoadGrammar(new System.Speech.Recognition.DictationGrammar());
            engine.SetInputToDefaultAudioDevice();
        }
        catch (Exception ex)
        {
            Error("start_failed:" + ex.Message);
            try { engine.Dispose(); } catch { }
            return;
        }
        engine.SpeechDetected += delegate { Emit("{\"event\":\"speech_detected\"}"); };
        engine.SpeechHypothesized += delegate(object sender, System.Speech.Recognition.SpeechHypothesizedEventArgs eventArgs)
        {
            if (eventArgs.Result == null || string.IsNullOrWhiteSpace(eventArgs.Result.Text)) return;
            Emit("{\"event\":\"hypothesis\",\"text\":\"" + Esc(eventArgs.Result.Text) + "\"}");
        };
        engine.SpeechRecognized += delegate(object sender, System.Speech.Recognition.SpeechRecognizedEventArgs eventArgs)
        {
            if (eventArgs.Result == null || string.IsNullOrWhiteSpace(eventArgs.Result.Text)) return;
            Emit("{\"event\":\"result\",\"text\":\"" + Esc(eventArgs.Result.Text) + "\",\"confidence\":" + eventArgs.Result.Confidence.ToString("0.###", CultureInfo.InvariantCulture) + "}");
        };
        engine.RecognizeCompleted += delegate(object sender, System.Speech.Recognition.RecognizeCompletedEventArgs eventArgs)
        {
            if (eventArgs != null && eventArgs.Error != null)
            {
                Error("recognize_failed:" + eventArgs.Error.Message);
            }
            Emit("{\"event\":\"completed\",\"status\":\"sapi\"}");
        };
        try
        {
            engine.RecognizeAsync(System.Speech.Recognition.RecognizeMode.Multiple);
        }
        catch (Exception ex)
        {
            Error("start_failed:" + ex.Message);
            try { engine.Dispose(); } catch { }
            return;
        }
        Emit("{\"event\":\"ready\",\"engine\":\"sapi\",\"language\":\"" + Esc(languageTag) + "\"}");
        WaitForStop();
        try { engine.RecognizeAsyncCancel(); } catch { }
        try { engine.Dispose(); } catch { }
        Emit("{\"event\":\"stopped\"}");
    }

    private static void WaitForStop()
    {
        var stop = new ManualResetEventSlim(false);
        var reader = new Thread(() =>
        {
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    if (line.Trim().Equals("stop", StringComparison.OrdinalIgnoreCase)) break;
                }
            }
            catch { }
            stop.Set();
        });
        reader.IsBackground = true;
        reader.Start();
        stop.Wait();
    }

    private static void Synthesize(string[] args)
    {
        if (args.Length < 3)
        {
            Error("missing_synthesis_path");
            return;
        }
        var outputPath = args[1];
        var encoded = args[2];
        var text = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
        var voiceSelector = args.Length > 3 ? args[3] : "";
        var rate = 0;
        if (args.Length > 4) int.TryParse(args[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out rate);
        var synth = FindVoice(voiceSelector);
        string language;
        var ssml = Encoding.UTF8.GetString(BuildSsml(text, rate, 0, out language));
        try
        {
            SpeechSynthesisStream stream;
            try { stream = synth.SynthesizeSsmlToStreamAsync(ssml).GetAwaiter().GetResult(); }
            catch { stream = synth.SynthesizeTextToStreamAsync(text).GetAwaiter().GetResult(); }
            using (var input = stream.AsStreamForRead())
            using (var output = File.Create(outputPath))
            {
                input.CopyTo(output);
            }
            var bytes = new FileInfo(outputPath).Length;
            Emit("{\"event\":\"synthesized\",\"path\":\"" + Esc(outputPath) + "\",\"bytes\":" + bytes + "}");
            stream.Dispose();
        }
        catch (Exception ex)
        {
            Error("synthesize_failed:" + ex.Message);
        }
        finally
        {
            synth.Dispose();
        }
    }

    private static void RecognizeFile(string[] args)
    {
        if (args.Length < 2)
        {
            Error("missing_wave_path");
            return;
        }
        var languageTag = args.Length > 2 ? args[2] : "en-US";
        using (var engine = new System.Speech.Recognition.SpeechRecognitionEngine(new CultureInfo(languageTag)))
        {
            engine.LoadGrammar(new System.Speech.Recognition.DictationGrammar());
            engine.SetInputToWaveFile(args[1]);
            var result = engine.Recognize();
            if (result == null)
            {
                Emit("{\"event\":\"result\",\"text\":\"\",\"confidence\":0}");
            }
            else
            {
                Emit("{\"event\":\"result\",\"text\":\"" + Esc(result.Text) + "\",\"confidence\":" + result.Confidence.ToString("0.###", CultureInfo.InvariantCulture) + "}");
            }
        }
    }
}
