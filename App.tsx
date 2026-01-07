
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
  SparklesIcon,
  ArrowDownTrayIcon
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
  
  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [showCandidateSelection, setShowCandidateSelection] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'stop' | 'origin' | 'edit'>('stop');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Listener para o evento de instalação do PWA
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    });

    // Detectar se já está rodando como App instalado
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }

    const savedStops = localStorage.getItem('delivery_stops_v8');
    if (savedStops) setStops(JSON.parse(savedStops));

    const savedOrigin = localStorage.getItem('delivery_origin_v8');
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

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  useEffect(() => {
    localStorage.setItem('delivery_stops_v8', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    if (originLocation) {
      localStorage.setItem('delivery_origin_v8', JSON.stringify(originLocation));
    } else {
      localStorage.removeItem('delivery_origin_v8');
    }
  }, [originLocation]);

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
      alert("Buscando sinal de GPS...");
      return;
    }
    setStops(prev => {
      const sortedByDistance = [...prev].sort((a, b) => {
        return calculateDistance(origin, a) - calculateDistance(origin, b);
      });
      return sortedByDistance.map((s, idx) => ({ 
        ...s, 
        order: idx + 1,
        status: 'pending' as const
      }));
    });
  }, [originLocation, currentLocation]);

  const toggleStopStatus = (id: string) => {
    setStops(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, status: s.status === 'pending' ? 'completed' : 'pending' } : s);
      const pending = updated.filter(s => s.status === 'pending').sort((a, b) => a.order - b.order);
      const completed = updated.filter(s => s.status === 'completed').sort((a, b) => a.order - b.order);
      return [...pending, ...completed];
    });
  };

  const addStopDirectly = (c: AddressCandidate) => {
    const nextOrder = stops.length > 0 ? Math.max(...stops.map(s => s.order)) + 1 : 1;
    setStops(prev => [...prev, { 
      id: Date.now().toString(), 
      address: c.address, 
      lat: c.lat, 
      lng: c.lng, 
      status: 'pending', 
      order: nextOrder 
    }]);
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
      setLoadingMessage('Escaneando Etiqueta...');
      
      try {
        const rawAddress = await extractAddressFromImage(base64);
        if (rawAddress && rawAddress.length > 5) {
          setLoadingMessage('Validando Endereço...');
          const results = await searchAddresses(rawAddress, originLocation?.address);
          
          if (results.length === 1) {
            addStopDirectly(results[0]);
          } else if (results.length > 1) {
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
      } catch (err) {
        console.error(err);
        setShowManual(true);
      }
      setIsLoading(false);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput) return;
    setIsLoading(true);
    setLoadingMessage('Localizando...');
    try {
      const results = await searchAddresses(manualInput, originLocation?.address);
      if (results.length === 1 && selectionTarget === 'stop') {
        addStopDirectly(results[0]);
        setManualInput('');
        setShowManual(false);
      } else if (results.length > 0) {
        setCandidates(results);
        setShowCandidateSelection(true);
        setShowManual(false);
      } else {
        alert("Endereço não encontrado.");
      }
    } catch {
      alert("Erro ao buscar endereço.");
    }
    setIsLoading(false);
  };

  const selectCandidate = (c: AddressCandidate) => {
    if (selectionTarget === 'stop') {
      addStopDirectly(c);
      setManualInput('');
    } else if (selectionTarget === 'edit' && editingStopId) {
      setStops(prev => prev.map(s => s.id === editingStopId ? { ...s, address: c.address, lat: c.lat, lng: c.lng } : s));
      setEditingStopId(null);
    } else {
      setOriginLocation({ address: c.address, lat: c.lat, lng: c.lng });
    }
    setShowCandidateSelection(false);
  };

  const startCamera = async () => {
    setIsCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      alert("Acesso à câmera negado.");
      setIsCapturing(false);
    }
  };

  const stopCamera = () => {
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setIsCapturing(false);
  };

  const clearStops = () => {
    if (stops.length === 0) return;
    if (window.confirm(`Deseja apagar TODOS os ${stops.length} endereços?`)) setStops([]);
  };

  const activeOrigin = originLocation || currentLocation;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#0b1120] text-slate-200 font-sans relative shadow-2xl">
      
      {showInstallBtn && (
        <div className="bg-indigo-600/20 backdrop-blur-md p-2 flex justify-between items-center px-6 border-b border-indigo-500/30 z-[60]">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Instale o App na Home</p>
          <button onClick={installApp} className="bg-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1">
            <ArrowDownTrayIcon className="w-3 h-3"/> Instalar
          </button>
        </div>
      )}

      <header className="p-6 pt-10">
        <div className="bg-indigo-600 p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 flex gap-2">
            <button onClick={clearStops} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${stops.length > 0 ? 'bg-red-500 text-white shadow-lg' : 'bg-white/5 text-white/20'}`}>
              <TrashIcon className="w-5 h-5" />
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
            className={`p-4 rounded-2xl border flex items-center gap-4 transition-all cursor-pointer ${!originLocation ? 'bg-white/10 border-white/10' : 'bg-indigo-500 border-white/30'}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${!originLocation ? 'bg-indigo-500' : 'bg-white/20'}`}>
              <HomeIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase text-indigo-100 tracking-[0.2em] mb-0.5">Partida</p>
              <p className="text-xs font-bold truncate text-white">
                {originLocation ? originLocation.address : (currentLocation ? 'Minha Localização (GPS)' : 'Buscando sinal...')}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-3 overflow-y-auto pb-40">
        {stops.length === 0 ? (
          <div className="py-20 text-center opacity-10 flex flex-col items-center">
            <SparklesIcon className="w-12 h-12 mb-2" />
            <p className="font-black text-xs uppercase tracking-widest">Escaneie uma Etiqueta</p>
          </div>
        ) : (
          stops.map((stop) => {
            const dist = activeOrigin ? calculateDistance(activeOrigin, stop) : null;
            return (
              <div key={stop.id} className={`p-4 rounded-[1.5rem] border transition-all ${stop.status === 'completed' ? 'opacity-20 bg-slate-900 border-slate-800' : 'bg-[#1e293b]/50 border-slate-700/50 shadow-lg'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${stop.status === 'completed' ? 'bg-slate-800 text-slate-600' : 'bg-indigo-600/20 text-indigo-400'}`}>
                    {stop.order}
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => stop.status === 'pending' && window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`)}>
                    <p className={`font-bold text-sm truncate ${stop.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'}`}>{stop.address}</p>
                    {dist !== null && <p className="text-[9px] text-indigo-400 font-black tracking-widest uppercase mt-0.5">{dist.toFixed(1)} KM</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleStopStatus(stop.id)} className={`p-2.5 rounded-xl transition-colors ${stop.status === 'completed' ? 'text-green-500 bg-green-500/20' : 'text-slate-500 bg-slate-800/50 hover:bg-slate-700'}`}>
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setStops(prev => prev.filter(s => s.id !== stop.id))} className="text-slate-700 p-2">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-8 bg-gradient-to-t from-[#0b1120] to-transparent pointer-events-none z-40">
        <div className="flex gap-3 pointer-events-auto">
          <button onClick={() => { setSelectionTarget('stop'); setShowManual(true); }} className="w-14 h-14 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-all">
            <PlusIcon className="w-6 h-6 text-slate-400" />
          </button>
          <button onClick={startCamera} className="flex-1 bg-indigo-600 rounded-2xl flex items-center justify-center gap-3 font-black text-white shadow-2xl active:scale-95 transition-all py-4">
            <CameraIcon className="w-5 h-5" />
            <span className="text-sm tracking-widest uppercase">Scanner de Endereço</span>
          </button>
        </div>
      </div>

      {(showManual || showEditModal) && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1e293b] w-full max-w-md rounded-t-[2.5rem] p-6 pb-10 border-t border-indigo-500/20 shadow-2xl">
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6 opacity-50" />
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-white uppercase text-[10px] tracking-widest opacity-60">
                {selectionTarget === 'origin' ? 'Ponto Inicial' : 'Novo Endereço'}
              </h3>
              <button onClick={() => { setShowManual(false); setShowEditModal(false); }} className="p-2 bg-slate-800/50 rounded-full text-slate-400">
                <XMarkIcon className="w-5 h-5"/>
              </button>
            </div>
            <form onSubmit={handleManualSearch} className="space-y-4">
              <input autoFocus type="text" placeholder="Digite o endereço..." className="w-full p-4 bg-slate-900 rounded-2xl outline-none border border-slate-700 text-sm font-bold text-white focus:border-indigo-500 transition-all" value={manualInput} onChange={e => setManualInput(e.target.value)} />
              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin"/> : "Localizar"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showCandidateSelection && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-[#1e293b] w-full max-w-md rounded-t-[2.5rem] p-6 pb-10 max-h-[70vh] overflow-y-auto">
            <h3 className="font-black text-white mb-6 uppercase tracking-widest text-[10px] opacity-40 text-center">Confirmar Endereço</h3>
            <div className="space-y-3">
              {candidates.map((c, i) => (
                <button key={i} onClick={() => selectCandidate(c)} className="w-full p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50 text-left text-xs font-bold flex gap-4 items-center hover:border-indigo-500/50 transition-all">
                  <MapPinIcon className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="truncate text-white">{c.address}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCandidateSelection(false)} className="w-full mt-8 py-3 text-slate-500 font-black text-[9px] uppercase tracking-widest">Voltar</button>
          </div>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[130] bg-black flex flex-col max-w-md mx-auto overflow-hidden">
          <div className="flex-1 relative">
            <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
              <div className="w-full aspect-[4/3] border-2 border-white/20 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,1)] animate-scanner-line"></div>
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>
              </div>
            </div>
          </div>
          <div className="p-12 flex justify-between items-center bg-black/80 border-t border-white/5">
             <button onClick={stopCamera} className="text-slate-500 font-black text-[10px] tracking-widest uppercase">Voltar</button>
             <button onClick={handlePhotoCapture} className="w-20 h-20 bg-white rounded-full border-[6px] border-indigo-600 shadow-2xl active:scale-90 transition-transform flex items-center justify-center">
                <div className="w-6 h-6 bg-indigo-600 rounded-sm"></div>
             </button>
             <div className="w-12" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[200] bg-[#0b1120]/95 backdrop-blur-2xl flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-indigo-500/10 rounded-full"></div>
            <div className="w-16 h-16 border-t-2 border-indigo-500 rounded-full animate-spin absolute inset-0"></div>
          </div>
          <p className="font-black text-[10px] tracking-[0.4em] uppercase text-indigo-400 ml-1">{loadingMessage}</p>
        </div>
      )}

      <style>{`
        @keyframes scanner-line {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scanner-line {
          animation: scanner-line 2s infinite ease-in-out;
        }
        body { background-color: #0b1120; user-select: none; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;
