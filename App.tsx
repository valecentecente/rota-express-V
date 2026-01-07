
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
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowRightOnRectangleIcon,
  SignalIcon
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
  
  // Estados para Edição
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [showCandidateSelection, setShowCandidateSelection] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'stop' | 'origin' | 'edit'>('stop');

  // Estado da Chave API
  const [hasKey, setHasKey] = useState(true);
  useEffect(() => {
    try {
      setHasKey(!!process.env.API_KEY);
    } catch {
      setHasKey(false);
    }
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Inicialização e GPS
  useEffect(() => {
    const savedStops = localStorage.getItem('delivery_stops');
    if (savedStops) setStops(JSON.parse(savedStops));

    const savedOrigin = localStorage.getItem('delivery_origin');
    if (savedOrigin) setOriginLocation(JSON.parse(savedOrigin));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        console.log("GPS Update:", pos.coords.latitude, pos.coords.longitude);
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.error("Erro GPS:", err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Salvamento Automático
  useEffect(() => {
    localStorage.setItem('delivery_stops', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    if (originLocation) {
      localStorage.setItem('delivery_origin', JSON.stringify(originLocation));
    } else {
      localStorage.removeItem('delivery_origin');
    }
  }, [originLocation]);

  const handleManualKeyInfo = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
    } else {
      alert("Aviso: Configure a API_KEY no Vercel e faça 'Redeploy'.");
    }
  };

  const clearAllData = () => {
    if (window.confirm("Deseja limpar todos os dados e começar do zero?")) {
      setStops([]);
      setOriginLocation(null);
      localStorage.removeItem('delivery_stops');
      localStorage.removeItem('delivery_origin');
    }
  };

  const resetToGPS = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOriginLocation(null);
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
      alert("Aguardando sinal de GPS...");
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
    setLoadingMessage('Buscando local...');
    try {
      const results = await searchAddresses(manualInput, originLocation?.address);
      if (results.length > 0) {
        setCandidates(results);
        setShowCandidateSelection(true);
        setShowManual(false);
      } else {
        alert("Endereço não localizado.");
      }
    } catch {
      handleManualKeyInfo();
    }
    setIsLoading(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInput) return;
    setIsLoading(true);
    setLoadingMessage('Atualizando dados...');
    try {
      const results = await searchAddresses(editInput, originLocation?.address);
      if (results.length > 0) {
        setCandidates(results);
        setSelectionTarget('edit');
        setShowCandidateSelection(true);
        setShowEditModal(false);
      } else {
        alert("Local não encontrado.");
      }
    } catch {
      handleManualKeyInfo();
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
      setLoadingMessage('Lendo endereço...');
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
        handleManualKeyInfo();
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
      alert("Permita o acesso à câmera.");
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
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#0b1120] text-slate-200">
      {/* Diagnóstico de Chave */}
      {!hasKey && (
        <div className="bg-amber-600 p-3 text-center text-[10px] font-black tracking-widest uppercase">
          Aguardando Configuração de Chave API
        </div>
      )}

      {/* Header Estilo Screenshot */}
      <header className="p-6 pt-10">
        <div className="bg-indigo-600/90 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 flex gap-2">
            <button onClick={clearAllData} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
              <ArrowRightOnRectangleIcon className="w-5 h-5 text-white" />
            </button>
            <button onClick={sortStops} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
              <ArrowPathIcon className="w-5 h-5 text-indigo-600" />
            </button>
          </div>
          
          <h1 className="text-xl font-black italic flex items-center gap-2 mb-6">
            <MapIcon className="w-6 h-6 not-italic" /> ROTA EXPRESS
          </h1>

          <div 
            onClick={() => { setSelectionTarget('origin'); setShowManual(true); }} 
            className={`p-4 rounded-2xl border flex items-center gap-4 transition-all active:scale-[0.98] ${isUsingGPS ? 'bg-white/10 border-white/10' : 'bg-indigo-500 border-white/30 shadow-inner'}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${isUsingGPS ? 'bg-indigo-500' : 'bg-white/20'}`}>
              <HomeIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[8px] font-black uppercase text-indigo-100 tracking-[0.2em]">Partida Atual</p>
                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full border ${isUsingGPS ? 'border-indigo-400 text-indigo-200' : 'border-white/40 text-white'}`}>
                  {isUsingGPS ? 'GPS' : 'MANUAL'}
                </span>
              </div>
              <p className="text-xs font-bold truncate text-white">
                {originLocation ? originLocation.address : (currentLocation ? 'Minha Localização (GPS)' : 'Buscando sinal GPS...')}
              </p>
            </div>
            {!isUsingGPS && (
              <button onClick={resetToGPS} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                <SignalIcon className="w-5 h-5 text-white" />
              </button>
            )}
            {isUsingGPS && (
               <PencilSquareIcon className="w-4 h-4 text-white/40" />
            )}
          </div>
        </div>
      </header>

      {/* Lista de Entregas Estilo Screenshot */}
      <main className="flex-1 p-6 space-y-3 overflow-y-auto pb-40">
        {stops.length === 0 ? (
          <div className="py-20 text-center opacity-10 flex flex-col items-center">
            <PlusIcon className="w-12 h-12 mb-2" />
            <p className="font-black text-xs uppercase tracking-widest">Inicie sua rota</p>
          </div>
        ) : (
          stops.map((stop, i) => {
            const dist = activeOrigin ? calculateDistance(activeOrigin, stop) : null;
            return (
              <div key={stop.id} className={`p-4 rounded-[1.5rem] border transition-all ${stop.status === 'completed' ? 'opacity-20 bg-slate-900 border-slate-800' : 'bg-[#1e293b]/50 border-slate-700/50 shadow-lg'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-600/20 text-indigo-400 rounded-xl flex items-center justify-center font-black text-xs">{i + 1}</div>
                  
                  <div className="flex-1 min-w-0" onClick={() => stop.status === 'pending' && window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`)}>
                    <p className={`font-bold text-sm truncate ${stop.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'}`}>{stop.address}</p>
                    {dist !== null && (
                      <p className="text-[9px] text-indigo-400 font-black tracking-widest uppercase mt-0.5">
                        {dist.toFixed(1)} KM DE DISTÂNCIA
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button onClick={() => setStops(prev => prev.map(s => s.id === stop.id ? {...s, status: s.status === 'pending' ? 'completed' : 'pending'} : s))} className={`p-2.5 rounded-xl ${stop.status === 'completed' ? 'text-green-500 bg-green-500/10' : 'text-slate-500 bg-slate-800/50'}`}>
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    {stop.status === 'pending' && (
                      <button onClick={(e) => { e.stopPropagation(); openEdit(stop); }} className="p-2 text-slate-600 hover:text-indigo-400">
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setStops(prev => prev.filter(s => s.id !== stop.id)); }} className="text-slate-700 p-2">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Botões Flutuantes Estilo Screenshot */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-8 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/90 to-transparent pointer-events-none">
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

      {/* Modais de Input */}
      {(showManual || showEditModal) && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] w-full rounded-t-[2.5rem] p-8 border-t border-indigo-500/30 animate-slide-up shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-white uppercase text-[10px] tracking-[0.3em] opacity-50">
                {showEditModal ? 'Editar Endereço' : (selectionTarget === 'origin' ? 'Definir Partida' : 'Novo Endereço')}
              </h3>
              <button onClick={() => { setShowManual(false); setShowEditModal(false); }} className="p-2"><XMarkIcon className="w-6 h-6 text-slate-500"/></button>
            </div>
            
            <form onSubmit={showEditModal ? handleEditSubmit : handleManualSearch} className="space-y-4">
              {selectionTarget === 'origin' && !showEditModal && (
                <button 
                  type="button" 
                  onClick={() => { setOriginLocation(null); setShowManual(false); }}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400 text-[10px] font-black tracking-widest uppercase mb-2"
                >
                  <SignalIcon className="w-4 h-4" /> Usar meu GPS
                </button>
              )}
              
              <input 
                autoFocus 
                type="text" 
                placeholder="Rua, Número, Cidade..." 
                className="w-full p-4 bg-slate-900/50 rounded-2xl outline-none border border-slate-700 text-sm font-bold text-white focus:border-indigo-500 transition-colors" 
                value={showEditModal ? editInput : manualInput} 
                onChange={e => showEditModal ? setEditInput(e.target.value) : setManualInput(e.target.value)} 
              />
              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl">
                {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto"/> : "Confirmar Local"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Seleção de Candidatos */}
      {showCandidateSelection && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="bg-[#1e293b] w-full rounded-t-[2.5rem] p-8 max-h-[70vh] overflow-y-auto">
            <h3 className="font-black text-white mb-6 uppercase tracking-widest text-[10px] opacity-40 text-center">Validar Endereço</h3>
            <div className="space-y-3">
              {candidates.map((c, i) => (
                <button key={i} onClick={() => selectCandidate(c)} className="w-full p-4 bg-slate-900/50 rounded-2xl border border-slate-700 text-left text-xs font-bold flex gap-4 items-center active:bg-indigo-600/20 active:border-indigo-600 transition-all">
                  <MapPinIcon className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="truncate">{c.address}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCandidateSelection(false)} className="w-full mt-8 py-2 text-slate-600 font-black text-[9px] tracking-[0.3em] uppercase">Voltar</button>
          </div>
        </div>
      )}

      {/* Câmera Fullscreen */}
      {isCapturing && (
        <div className="fixed inset-0 z-[130] bg-black flex flex-col">
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
          <div className="p-12 flex justify-between items-center bg-black/80 backdrop-blur-xl">
             <button onClick={stopCamera} className="text-slate-500 font-black text-[10px] tracking-widest">CANCELAR</button>
             <button onClick={handlePhotoCapture} className="w-20 h-20 bg-white rounded-full border-[6px] border-indigo-600 shadow-2xl active:scale-90 transition-transform" />
             <div className="w-12" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Loading Screen */}
      {isLoading && (
        <div className="fixed inset-0 z-[200] bg-[#0b1120]/95 backdrop-blur-2xl flex flex-col items-center justify-center space-y-6">
          <div className="w-16 h-16 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="font-black text-[10px] tracking-[0.4em] uppercase text-indigo-400">{loadingMessage}</p>
        </div>
      )}

      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        body { background-color: #0b1120; user-select: none; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;
// Checkpoint de Segurança: 2024-05-21 02:00 - Estabilidade Garantida V3.2 - GPS Prioritário e Partida Manual