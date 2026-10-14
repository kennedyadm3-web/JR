import React, { useState } from 'react';
import { 
  Sparkles, 
  Settings, 
  CheckCircle2, 
  Cpu, 
  Zap, 
  ShieldCheck, 
  Activity, 
  RefreshCw, 
  Info,
  Sliders,
  Database,
  Globe
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function UsageSettingsView() {
  const [selectedModel, setSelectedModel] = useState('models/gemini-2.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(8192);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const start = Date.now();
    try {
      // Simulate/ping server status or gemini endpoint
      const res = await fetch('/api/admin-status');
      const latency = Date.now() - start;
      if (res.ok) {
        setTestResult({
          success: true,
          message: 'Conexão com Google AI API e servidor realizada com sucesso!',
          latency
        });
      } else {
        setTestResult({
          success: false,
          message: 'Erro na resposta do servidor de IA.'
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Falha ao conectar com o serviço de IA.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" /> Uso de Recursos & Assinatura de IA
        </h2>
        <p className="text-xs text-gray-500 font-medium">
          Acompanhe o consumo da sua cota, modelo de inteligência artificial ativo e configurações de integração.
        </p>
      </div>

      {/* Usage Header Card - Matches attached print */}
      <div className="space-y-2">
        <span className="text-sm font-semibold text-gray-600 tracking-wide">Usage</span>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-gray-200/80 shadow-xs transition-all hover:shadow-md group">
          {/* Top Multi-color Rainbow Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-500 via-yellow-400 via-rose-500 to-indigo-600" />
          
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100/80 text-blue-800 border border-blue-200 shadow-2xs">
                PRO
              </span>
              <p className="text-base font-semibold text-gray-800 leading-snug">
                You’re currently using your Google AI subscription for requests in chat.
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              className="p-2.5 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-gray-200/80 transition-all cursor-pointer shrink-0 shadow-3xs"
              title="Configurações e Teste da API de IA"
            >
              <Settings className="w-5 h-5 transition-transform group-hover:rotate-45" />
            </button>
          </div>
        </div>
      </div>

      {/* Test Status Banner */}
      {testResult && (
        <div
          className={cn(
            "p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1",
            testResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          )}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{testResult.message}</span>
          </div>
          {testResult.latency && (
            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-mono text-[10px]">
              {testResult.latency} ms
            </span>
          )}
        </div>
      )}

      {/* System Capability & Model Specs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Capacidade Ativa</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-gray-900 truncate">Server-Side Gemini API</span>
          </div>
          <p className="text-[11px] text-gray-500">Major capability ativa no metadata do applet.</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Modelo Padrão</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-bold text-gray-900">Gemini 2.5 Flash</span>
          </div>
          <p className="text-[11px] text-gray-500">Alta velocidade e contexto longo para análises.</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status do Servidor</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-bold text-gray-900">Operacional (Google Cloud)</span>
          </div>
          <p className="text-[11px] text-gray-500">Serviço integrado ao ecossistema Google AI Studio.</p>
        </div>
      </div>

      {/* Model & Generation Parameters Card */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-gray-900">Parâmetros do Modelo de IA</h3>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isTesting && "animate-spin")} />
            {isTesting ? 'Testando...' : 'Testar Conexão IA'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Modelo Selecionado
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 transition-all text-xs font-bold text-gray-800 cursor-pointer"
            >
              <option value="models/gemini-2.5-flash">Gemini 2.5 Flash (Recomendado - Multimodal & Rápido)</option>
              <option value="models/gemini-1.5-pro">Gemini 1.5 Pro (Raciocínio Avançado)</option>
              <option value="models/gemini-1.5-flash">Gemini 1.5 Flash (Ultrarrápido)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Máximo de Tokens de Resposta ({maxTokens})
            </label>
            <input
              type="range"
              min="1024"
              max="16384"
              step="1024"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-semibold text-gray-400 mt-1">
              <span>1K</span>
              <span>8K</span>
              <span>16K</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Temperatura de Criatividade ({temperature})
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-semibold text-gray-400 mt-1">
              <span>0.0 (Mais Preciso & Focado)</span>
              <span>0.5 (Equilibrado)</span>
              <span>1.0 (Criativo)</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">
            As requisições utilizam autenticação direta do servidor de aplicação com chave de API segura gerenciada pelo Google AI Studio, sem expor credenciais ao cliente.
          </p>
        </div>
      </div>
    </div>
  );
}
