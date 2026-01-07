
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { extractAddressFromImage, searchAddresses, AddressCandidate } from './services/geminiService';
import { DeliveryLocation, UserLocation } from './types';
import { 
  CameraIcon, 
  MapIcon, 
  TrashIcon, 
  CheckCircleIcon, 
  ArrowPathIcon, 
  PlusIcon, 
  XMarkIcon, 
  MapPinIcon, 
  HomeIcon, 
  PencilSquareIcon,
  ArrowRightOnRectangleIcon,
  SignalIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [stops, setStops] = useState<DeliveryLocation[]>([]);
  const [currentLocation, setCurrentLocation] = useState<UserLocation | null>(null);
  const [originLocation, setOriginLocation] = useState<{address: string, lat: number, lng: number} | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processando...');
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);
  
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [showCandidateSelection, setShowCandidateSelection] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'stop' | 'origin' | 'edit'>('stop');

  const [hasKey, setHasKey] = useState(true);

  // Verificação de Chave de API no Vercel
  useEffect(() => {
    const checkKey = () => {
      const key = process.env.API_KEY;
      setHasKey(!!key && key !== "undefined" && key.length > 10);
    };
    checkKey();
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const savedStops = localStorage.getItem('delivery_stops_v4');
    if (savedStops) setStops(JSON.parse(savedStops));

    const savedOrigin = localStorage.getItem('delivery_origin_v4');
    if (savedOrigin) setOriginLocation(JSON.parse(savedOrigin));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.error("Erro GPS:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    localStorage.setItem('delivery_stops_v4', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    if (originLocation) {
      localStorage.setItem('delivery_origin_v4', JSON.stringify(originLocation));
    } else {
      localStorage.removeItem('delivery_origin_v4');
    }
  }, [originLocation]);

  const clearAllData = () => {
    if (window.confirm("Deseja limpar todos os dados salvos no seu celular?")) {
      setStops([]);
      setOriginLocation(null);
      localStorage.clear();
      window.location.reload();
    }
  };

  const calculateDistance = (l1: UserLocation, l2: { lat: number, lng: number }) => {
    const R = 6371;
    const dLat = (l2.lat - l1.lat) * Math.PI / 180;
    const dLon = (l2.lng - l1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(l1.lat * Math.PI / 180) * Math.cos(l2.lat * Math.PI / 180) * Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const sortStops = useCallback(() => {
    const origin = originLocation || currentLocation;
    if (!origin) {
      alert("Aguardando sinal de GPS para calcular rotas...");
      return;
    }
    setStops(prev => {
      const pending = prev.filter(s => s.status === 'pending');
      const completed = prev.filter(s => s.status === 'completed');
      const sorted = [...pending].sort((a, b) => calculateDistance(origin, a) - calculateDistance(origin, b));
      return [...sorted, ...completed];
    });
  }, [originLocation, currentLocation]);

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput) return;
    setIsLoading(true);
    setLoadingMessage('Buscando endereço...');
    try {
      const results = await searchAddresses(manualInput, originLocation?.address);
      if (results.length > 0) {
        setCandidates(results);
        setShowCandidateSelection(true);
        setShowManual(false);
      } else {
        alert("Nenhum local encontrado com este nome.");
      }
    } catch (error) {
      alert("Erro na busca. Verifique sua chave de API nas configurações do Vercel.");
    }
    setIsLoading(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInput) return;
    setIsLoading(true);
    setLoadingMessage('Atualizando...');
    try {
      const results = await searchAddresses(editInput, originLocation?.address);
      if (results.length > 0) {
        setCandidates(results);
        setSelectionTarget('edit');
        setShowCandidateSelection(true);
        setShowEditModal(false);
      } else {
        alert("Endereço não localizado.");
      }
    } catch {
      alert("Erro ao editar. Verifique sua chave de API.");
    }
    setIsLoading(false);
  };

  const handlePhotoCapture = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const base64 = canvasRef.current.toDataURL('image/jpeg').split(',')[1];
      stopCamera();
      setIsLoading(true);
      setLoadingMessage('Gemini lendo endereço...');
      try {
        const rawAddress = await extractAddressFromImage(base64);
        if (rawAddress) {
          const results = await searchAddresses(rawAddress, originLocation?.address);
          if (results.length > 0) {
            setCandidates(results);
            setSelectionTarget('stop');
            setShowCandidateSelection(true);
          } else {
            setManualInput(rawAddress);
            setShowManual(true);
          }
        } else {
          setShowManual(true);
        }
      } catch {
        alert("Erro ao processar foto. Verifique a API_KEY.");
      }
      setIsLoading(false);
    }
  };

  const selectCandidate = (c: AddressCandidate) => {
    if (selectionTarget === 'stop') {
      setStops(prev => [...prev, { id: Date.now().toString(), address: c.address, lat: c.lat, lng: c.lng, status: 'pending' }]);
      setManualInput('');
    } else if (selectionTarget === 'edit' && editingStopId) {
      setStops(prev => prev.map(s => s.id === editingStopId ? { ...s, address: c.address, lat: c.lat, lng: c.lng } : s));
      setEditingStopId(null);
      setEditInput('');
    } else {
      setOriginLocation({ address: c.address, lat: c.lat, lng: c.lng });
      setManualInput('');
    }
    setShowCandidateSelection(false);
  };

  const startCamera = async () => {
    setIsCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      alert("Permita o acesso à câmera nas configurações do navegador.");
      setIsCapturing(false);
    }
  };

  const stopCamera = () => {
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setIsCapturing(false);
  };

  const openEdit = (stop: DeliveryLocation) => {
    setEditingStopId(stop.id);
    setEditInput(stop.address);
    setShowEditModal(true);
  };

  const activeOrigin = originLocation || currentLocation;
  const isUsingGPS = !originLocation;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#0b1120] text-slate-200 font-sans relative">
      
      {/* Aviso de Configuração no Vercel */}
      {!hasKey && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 p-3 flex items-center justify-center gap-2">
          <ExclamationCircleIcon className="w-4 h-4 text-amber-500" />
          <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider">
            API_KEY não configurada no Vercel
          </p>
        </div>
      )}

      <header className="p-6 pt-10">
        <div className="bg-indigo-600/90 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 flex gap-2">
            <button onClick={clearAllData} title="Limpar Tudo" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md active:scale-90 transition-transform">
              <ArrowRightOnRectangleIcon className="w-5 h-5 text-white" />
            </button>
            <button onClick={sortStops} title="Otimizar Rota" className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
              <ArrowPathIcon className="w-5 h-5 text-indigo-600" />
            </button>
          </div>
          
          <h1 className="text-xl font-black italic flex items-center gap-2 mb-6">
            <MapIcon className="w-6 h-6 not-italic" /> ROTA EXPRESS
          </h1>

          <div 
            onClick={() => { setSelectionTarget('origin'); setShowManual(true); }} 
            className={`p-4 rounded-2xl border flex items-center gap-4 transition-all cursor-pointer active:scale-[0.98] ${isUsingGPS ? 'bg-white/10 border-white/10' : 'bg-indigo-500 border-white/30'}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${isUsingGPS ? 'bg-indigo-500' : 'bg-white/20'}`}>
              <HomeIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[8px] font-black uppercase text-indigo-100 tracking-[0.2em]">Ponto de Partida</p>
                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full border ${isUsingGPS ? 'border-indigo-400 text-indigo-200' : 'border-white/40 text-white'}`}>
                  {isUsingGPS ? 'GPS' : 'FIXO'}
                </span>
              </div>
              <p className="text-xs font-bold truncate text-white">
                {originLocation ? originLocation.address : (currentLocation ? 'Minha Localização (GPS)' : 'Buscando satélite...')}
              </p>
            </div>
            {!isUsingGPS && (
              <button onClick={(e) => { e.stopPropagation(); setOriginLocation(null); }} className="p-2 bg-white/20 rounded-lg">
                <SignalIcon className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-3 overflow-y-auto pb-40">
        {stops.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-800 shadow-inner">
              <MapPinIcon className="w-8 h-8 text-slate-700" />
            </div>
            <p className="font-black text-xs uppercase tracking-[0.2em] text-slate-600 mb-2">Sua lista está vazia</p>
            <p className="text-[10px] text-slate-700 font-bold max-w-[200px] leading-relaxed">
              Adicione endereços manualmente ou use a câmera para ler etiquetas.
            </p>
          </div>
        ) : (
          stops.map((stop, i) => {
            const dist = activeOrigin ? calculateDistance(activeOrigin, stop) : null;
            return (
              <div key={stop.id} className={`p-4 rounded-[1.5rem] border transition-all ${stop.status === 'completed' ? 'opacity-30 bg-slate-900 border-slate-800' : 'bg-[#1e293b]/50 border-slate-700/50 shadow-lg'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-600/20 text-indigo-400 rounded-xl flex items-center justify-center font-black text-xs">{i + 1}</div>
                  <div className="flex-1 min-w-0" onClick={() => stop.status === 'pending' && window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`)}>
                    <p className={`font-bold text-sm truncate ${stop.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'}`}>{stop.address}</p>
                    {dist !== null && <p className="text-[9px] text-indigo-400 font-black tracking-widest uppercase mt-0.5">{dist.toFixed(1)} KM</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setStops(prev => prev.map(s => s.id === stop.id ? {...s, status: s.status === 'pending' ? 'completed' : 'pending'} : s))} className={`p-2.5 rounded-xl ${stop.status === 'completed' ? 'text-green-500 bg-green-500/10' : 'text-slate-500 bg-slate-800/50'}`}>
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    {stop.status === 'pending' && (
                      <button onClick={(e) => { e.stopPropagation(); openEdit(stop); }} className="p-2 text-slate-600 active:text-indigo-400">
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setStops(prev => prev.filter(s => s.id !== stop.id)); }} className="text-slate-700 p-2 active:text-red-500">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-8 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/90 to-transparent pointer-events-none z-40">
        <div className="flex gap-3 pointer-events-auto">
          <button onClick={() => { setSelectionTarget('stop'); setShowManual(true); }} className="w-14 h-14 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-all">
            <PlusIcon className="w-6 h-6 text-slate-400" />
          </button>
          <button onClick={startCamera} className="flex-1 bg-indigo-600 rounded-2xl flex items-center justify-center gap-3 font-black text-white shadow-2xl active:scale-95 transition-all py-4">
            <CameraIcon className="w-5 h-5" />
            <span className="text-sm tracking-widest uppercase">Bater Foto</span>
          </button>
        </div>
      </div>

      {(showManual || showEditModal) && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-[#0b1120]/70 backdrop-blur-md">
          <div className="bg-[#0b1120] w-full max-w-md rounded-t-[2.5rem] p-6 pb-8 border-t border-indigo-500/30 animate-slide-up shadow-[0_-15px_60px_rgba(0,0,0,1)] ring-1 ring-white/5">
            <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-6 opacity-80" />
            
            <div className="flex justify-between items-center mb-6 px-2">
              <h3 className="font-black text-indigo-400 uppercase text-[11px] tracking-[0.2em]">
                {showEditModal ? 'Editar Local' : (selectionTarget === 'origin' ? 'Definir Partida' : 'Novo Destino')}
              </h3>
              <button 
                onClick={() => { setShowManual(false); setShowEditModal(false); }} 
                className="p-2 bg-slate-900 rounded-full text-slate-500 active:text-white transition-colors border border-white/5"
              >
                <XMarkIcon className="w-4 h-4"/>
              </button>
            </div>

            <form onSubmit={showEditModal ? handleEditSubmit : handleManualSearch} className="space-y-5">
              <div className="relative group">
                 <input 
                  autoFocus 
                  type="text" 
                  placeholder="Rua, Número, Cidade..." 
                  className="w-full p-4 pl-12 bg-slate-900/60 rounded-2xl outline-none border border-slate-800 text-sm font-bold text-white focus:border-indigo-600/50 transition-all placeholder:text-slate-700" 
                  value={showEditModal ? editInput : manualInput} 
                  onChange={e => showEditModal ? setEditInput(e.target.value) : setManualInput(e.target.value)} 
                />
                <MapPinIcon className="w-5 h-5 text-indigo-600/60 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-400 transition-colors" />
              </div>

              <button 
                type="submit" 
                disabled={isLoading} 
                className="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.1em] shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2 text-white"
              >
                {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin"/> : "Confirmar Local"}
              </button>
              
              {selectionTarget === 'origin' && !showEditModal && (
                <button 
                  type="button" 
                  onClick={() => { setOriginLocation(null); setShowManual(false); }} 
                  className="w-full py-2 text-indigo-400/60 text-[10px] font-black uppercase tracking-widest hover:text-indigo-400 transition-all"
                >
                  Voltar para GPS Automático
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {showCandidateSelection && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 backdrop-blur-xl">
          <div className="bg-[#0b1120] w-full max-w-md rounded-t-[2.5rem] p-6 pb-10 max-h-[60vh] overflow-y-auto animate-slide-up border-t border-indigo-900/50">
            <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-6" />
            <h3 className="font-black text-slate-400 mb-6 uppercase tracking-widest text-[10px] text-center opacity-60">Confirme o Endereço</h3>
            <div className="space-y-3">
              {candidates.map((c, i) => (
                <button 
                  key={i} 
                  onClick={() => selectCandidate(c)} 
                  className="w-full p-4 bg-slate-900/40 rounded-2xl border border-white/5 text-left text-xs font-bold flex gap-4 items-center hover:border-indigo-500/30 active:bg-indigo-600/10 transition-all"
                >
                  <div className="w-8 h-8 bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
                    <MapPinIcon className="w-4 h-4 text-indigo-500" />
                  </div>
                  <span className="truncate text-slate-200">{c.address}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCandidateSelection(false)} className="w-full mt-8 py-3 text-slate-600 font-black text-[9px] uppercase tracking-widest">Voltar</button>
          </div>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[130] bg-black flex flex-col max-w-md mx-auto">
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
          <div className="p-12 flex justify-between items-center bg-black/90 border-t border-white/5">
             <button onClick={stopCamera} className="text-slate-500 font-black text-[10px] tracking-widest">CANCELAR</button>
             <button onClick={handlePhotoCapture} className="w-20 h-20 bg-white rounded-full border-[6px] border-indigo-600 shadow-2xl active:scale-90 transition-transform" />
             <div className="w-12" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[200] bg-[#0b1120]/98 backdrop-blur-3xl flex flex-col items-center justify-center space-y-8 max-w-md mx-auto">
          <div className="relative">
            <div className="w-20 h-20 border-2 border-indigo-500/5 rounded-full"></div>
            <div className="w-20 h-20 border-t-2 border-indigo-500 rounded-full animate-spin absolute inset-0"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <MapIcon className="w-6 h-6 text-indigo-500/30" />
            </div>
          </div>
          <p className="font-black text-[10px] tracking-[0.5em] uppercase text-indigo-500 ml-1.5">{loadingMessage}</p>
        </div>
      )}

      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        body { background-color: #000; user-select: none; -webkit-tap-highlight-color: transparent; height: 100%; overflow: hidden; }
        #root { height: 100%; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;
// Checkpoint de Segurança: 2024-05-21 13:45 - Estabilidade Garantida V4.8 - Verificação de Chave Vercel e Estado Vazio