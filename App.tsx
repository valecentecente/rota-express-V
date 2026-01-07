
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
  SparklesIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
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
  
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [showCandidateSelection, setShowCandidateSelection] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'stop' | 'origin'>('stop');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    });

    const savedStops = localStorage.getItem('delivery_stops_v12');
    if (savedStops) setStops(JSON.parse(savedStops));

    const savedOrigin = localStorage.getItem('delivery_origin_v12');
    if (savedOrigin) setOriginLocation(JSON.parse(savedOrigin));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => console.error("Erro GPS:", err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    localStorage.setItem('delivery_stops_v12', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    if (originLocation) {
      localStorage.setItem('delivery_origin_v12', JSON.stringify(originLocation));
    } else {
      localStorage.removeItem('delivery_origin_v12');
    }
  }, [originLocation]);

  const calculateDistance = (l1: {lat: number, lng: number}, l2: { lat: number, lng: number }) => {
    const R = 6371;
    const dLat = (l2.lat - l1.lat) * Math.PI / 180;
    const dLon = (l2.lng - l1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(l1.lat * Math.PI / 180) * Math.cos(l2.lat * Math.PI / 180) * Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const sortStops = useCallback(() => {
    const origin = originLocation || currentLocation;
    if (!origin) return alert("Aguardando sinal de GPS...");
    
    setStops(prev => {
      const sorted = [...prev].sort((a, b) => calculateDistance(origin, a) - calculateDistance(origin, b));
      return sorted.map((s, idx) => ({ ...s, order: idx + 1 }));
    });
  }, [originLocation, currentLocation]);

  const openNavigation = (lat: number, lng: number, app: 'waze' | 'google') => {
    if (app === 'waze') {
      window.open(`https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    }
  };

  const addStopDirectly = (c: AddressCandidate) => {
    const nextOrder = stops.length + 1;
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
      
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.9).split(',')[1];
      stopCamera();
      setIsLoading(true);
      setLoadingMessage('Lendo etiqueta...');
      
      try {
        const rawAddress = await extractAddressFromImage(base64);
        if (rawAddress) {
          setLoadingMessage('Localizando no mapa...');
          const results = await searchAddresses(rawAddress, originLocation?.address || (currentLocation ? `lat: ${currentLocation.lat}, lng: ${currentLocation.lng}` : undefined));
          if (results.length === 1) {
            if (selectionTarget === 'origin') {
              setOriginLocation(results[0]);
            } else {
              addStopDirectly(results[0]);
            }
          } else if (results.length > 1) {
            setCandidates(results);
            setShowCandidateSelection(true);
          } else {
            setManualInput(rawAddress);
            setShowManual(true);
          }
        } else {
          alert("Não foi possível ler o endereço. Tente digitar ou tirar outra foto com mais luz.");
          setShowManual(true);
        }
      } catch (err) {
        console.error(err);
        setShowManual(true);
      }
      setIsLoading(false);
    }
  };

  const startCamera = (target: 'stop' | 'origin') => {
    setSelectionTarget(target);
    setIsCapturing(true);
    const constraints: any = { 
      video: { 
        facingMode: 'environment', 
        width: { ideal: 1920 }, 
        height: { ideal: 1080 },
        focusMode: 'continuous'
      } 
    };
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(() => { alert("Erro ao abrir câmera."); setIsCapturing(false); });
  };

  const stopCamera = () => {
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setIsCapturing(false);
  };

  const useCurrentAsOrigin = () => {
    setOriginLocation(null); // Ao setar null, o sistema usa o currentLocation automaticamente
    setShowManual(false);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#0b1120] text-slate-200 relative overflow-hidden">
      
      {showInstallBtn && (
        <button onClick={async () => { deferredPrompt.prompt(); setShowInstallBtn(false); }} className="bg-indigo-600 p-3 text-center text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
          <ArrowDownTrayIcon className="w-4 h-4"/> Instalar no Celular
        </button>
      )}

      <header className="p-6 pb-0">
        <div className="bg-indigo-600 p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          {/* Luzes de fundo */}
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 blur-3xl rounded-full"></div>
          
          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={() => setStops([])} className="p-2 bg-red-500 rounded-full shadow-lg active:scale-90 transition-transform"><TrashIcon className="w-5 h-5"/></button>
            <button onClick={sortStops} className="p-2 bg-white rounded-full shadow-lg active:scale-90 transition-transform"><ArrowPathIcon className="w-5 h-5 text-indigo-600"/></button>
          </div>
          
          <h1 className="text-xl font-black italic flex items-center gap-2 mb-6">
            <MapIcon className="w-6 h-6"/> ROTA EXPRESS
          </h1>
          
          <div 
            onClick={() => { setSelectionTarget('origin'); setShowManual(true); }} 
            className={`p-4 rounded-2xl flex items-center gap-3 cursor-pointer transition-all border ${originLocation ? 'bg-white/10 border-white/30' : 'bg-indigo-500/30 border-indigo-400/50 shadow-[0_0_15px_rgba(255,255,255,0.1)]'}`}
          >
            {originLocation ? <HomeIcon className="w-5 h-5 text-indigo-200" /> : <SignalIcon className="w-5 h-5 text-green-400 animate-pulse" />}
            <div className="flex-1 truncate">
              <p className="text-[8px] font-black uppercase text-indigo-200 opacity-60 flex items-center gap-1">
                Ponto de Partida {originLocation ? '' : '• GPS Ativo'}
              </p>
              <p className="text-xs font-bold truncate">
                {originLocation?.address || "Minha Localização Atual"}
              </p>
            </div>
            <ArrowPathIcon className="w-3 h-3 opacity-40" />
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-4 overflow-y-auto pb-32">
        {stops.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center opacity-20 text-center">
            <SparklesIcon className="w-16 h-16 mb-4" />
            <p className="font-black text-xs uppercase tracking-widest">Escaneie sua primeira entrega</p>
          </div>
        ) : (
          stops.map((stop) => (
            <div key={stop.id} className={`p-4 rounded-3xl border transition-all ${stop.status === 'completed' ? 'bg-slate-900/50 border-slate-800 opacity-40 scale-95' : 'bg-slate-800/40 border-slate-700/50'}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-lg">{stop.order}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{stop.address}</p>
                  <div className="flex gap-4 mt-2">
                    <button onClick={() => openNavigation(stop.lat, stop.lng, 'waze')} className="text-[9px] font-black uppercase text-indigo-400 flex items-center gap-1 bg-indigo-400/10 px-3 py-1.5 rounded-lg border border-indigo-400/20 active:bg-indigo-400/30">
                      Waze <ArrowTopRightOnSquareIcon className="w-3 h-3"/>
                    </button>
                    <button onClick={() => openNavigation(stop.lat, stop.lng, 'google')} className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1 bg-slate-400/10 px-3 py-1.5 rounded-lg border border-slate-400/20 active:bg-slate-400/30">
                      Google Maps
                    </button>
                  </div>
                </div>
                <button onClick={() => setStops(prev => prev.map(s => s.id === stop.id ? { ...s, status: s.status === 'pending' ? 'completed' : 'pending' } : s))} className={`p-3 rounded-2xl transition-colors ${stop.status === 'completed' ? 'text-green-500 bg-green-500/10' : 'text-slate-500 hover:bg-white/5'}`}>
                  <CheckCircleIcon className="w-7 h-7" />
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 p-8 bg-gradient-to-t from-[#0b1120] via-[#0b1120] to-transparent">
        <div className="flex gap-3 max-w-md mx-auto">
          <button onClick={() => { setSelectionTarget('stop'); setShowManual(true); }} className="w-16 h-16 bg-slate-800 rounded-3xl border border-slate-700 flex items-center justify-center shadow-2xl active:scale-90 transition-all">
            <PlusIcon className="w-7 h-7 text-slate-400" />
          </button>
          <button onClick={() => startCamera('stop')} className="flex-1 bg-indigo-600 rounded-3xl flex items-center justify-center gap-3 font-black text-white shadow-2xl active:scale-95 transition-all">
            <CameraIcon className="w-6 h-6" />
            <span className="uppercase tracking-widest text-xs">Escanear Entrega</span>
          </button>
        </div>
      </div>

      {(showManual) && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-indigo-500/20 animate-slide-up">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-black text-xs uppercase tracking-widest opacity-60">
                 {selectionTarget === 'origin' ? 'Ponto de Partida' : 'Nova Entrega'}
               </h3>
               {selectionTarget === 'origin' && (
                 <button onClick={useCurrentAsOrigin} className="text-[10px] font-black uppercase text-green-400 flex items-center gap-1 bg-green-400/10 px-3 py-2 rounded-full border border-green-400/20">
                   <SignalIcon className="w-3 h-3" /> Usar Meu Local
                 </button>
               )}
            </div>
            
            <input autoFocus type="text" className="w-full p-5 bg-slate-900 rounded-2xl border border-slate-700 font-bold mb-4 outline-none focus:border-indigo-500 transition-colors" value={manualInput} onChange={e => setManualInput(e.target.value)} placeholder="Rua, Número, Bairro, Cidade..." />
            
            <div className="flex gap-3">
               <button onClick={() => { setShowManual(false); setManualInput(''); }} className="flex-1 py-4 text-xs font-black uppercase opacity-40">Cancelar</button>
               <button onClick={async () => {
                 if (!manualInput) return;
                 setIsLoading(true);
                 try {
                   const res = await searchAddresses(manualInput, originLocation?.address || (currentLocation ? `${currentLocation.lat}, ${currentLocation.lng}` : undefined));
                   if (res.length > 0) {
                     if (selectionTarget === 'origin') setOriginLocation(res[0]);
                     else addStopDirectly(res[0]);
                     setShowManual(false);
                     setManualInput('');
                   } else alert("Endereço não localizado. Tente ser mais específico.");
                 } catch (e) { alert("Erro de conexão."); }
                 setIsLoading(false);
               }} className="flex-[2] bg-indigo-600 py-4 rounded-2xl font-black text-xs uppercase shadow-xl active:scale-95 transition-transform">Confirmar</button>
            </div>
            
            <button onClick={() => { setShowManual(false); startCamera(selectionTarget); }} className="w-full mt-4 py-4 rounded-2xl border border-dashed border-indigo-500/30 text-indigo-400 font-black text-xs uppercase flex items-center justify-center gap-2">
              <CameraIcon className="w-4 h-4" /> Tentar Tirar Foto
            </button>
          </div>
        </div>
      )}

      {showCandidateSelection && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#1e293b] w-full max-w-md rounded-[2.5rem] p-8 max-h-[80vh] overflow-y-auto">
            <h3 className="text-center font-black text-xs uppercase tracking-widest mb-6">Qual endereço da etiqueta?</h3>
            <div className="space-y-3">
              {candidates.map((c, i) => (
                <button key={i} onClick={() => { 
                  if (selectionTarget === 'origin') setOriginLocation(c);
                  else addStopDirectly(c); 
                  setShowCandidateSelection(false); 
                }} className="w-full p-5 bg-slate-900 rounded-2xl border border-slate-700 text-left text-sm font-bold flex gap-3 hover:border-indigo-500 transition-colors">
                  <MapPinIcon className="w-5 h-5 text-indigo-400 shrink-0"/> {c.address}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowCandidateSelection(false); setShowManual(true); }} className="w-full mt-6 py-4 text-[10px] font-black uppercase opacity-40">Digitar manualmente</button>
          </div>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[120] bg-black max-w-md mx-auto flex flex-col">
          <div className="flex-1 relative">
            <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 border-[40px] border-black/60 flex items-center justify-center">
              <div className="w-full aspect-[4/3] border-2 border-indigo-500/50 rounded-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_20px_#6366f1] animate-scan-fast"></div>
                <div className="absolute -top-10 left-0 w-full text-center text-[10px] font-black uppercase text-indigo-400 bg-indigo-400/10 py-1 rounded-t-lg">Enquadre o Endereço</div>
              </div>
            </div>
          </div>
          <div className="p-10 bg-black flex justify-between items-center">
            <button onClick={stopCamera} className="text-white/40 font-black text-[10px] uppercase">Sair</button>
            <button onClick={handlePhotoCapture} className="w-20 h-20 bg-white rounded-full border-8 border-indigo-600 active:scale-90 transition-transform flex items-center justify-center shadow-[0_0_30px_rgba(79,70,229,0.5)]">
              <div className="w-6 h-6 bg-indigo-600 rounded-full"></div>
            </button>
            <div className="w-10"></div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[200] bg-[#0b1120]/90 backdrop-blur-xl flex flex-col items-center justify-center max-w-md mx-auto">
          <div className="relative">
            <div className="w-20 h-20 border-t-4 border-indigo-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
            </div>
          </div>
          <p className="mt-8 font-black text-[10px] uppercase tracking-[0.4em] text-indigo-400 animate-pulse">{loadingMessage}</p>
        </div>
      )}

      <style>{`
        @keyframes scan-fast { 
          0% { top: 0%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-scan-fast { animation: scan-fast 1.5s infinite linear; }
        .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        body { overscroll-behavior: none; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
};

export default App;
