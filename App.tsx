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
  
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [showCandidateSelection, setShowCandidateSelection] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<'stop' | 'origin' | 'edit'>('stop');

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

  useEffect(() => {
    const savedStops = localStorage.getItem('delivery_stops_v6');
    if (savedStops) setStops(JSON.parse(savedStops));

    const savedOrigin = localStorage.getItem('delivery_origin_v6');
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
    localStorage.setItem('delivery_stops_v6', JSON.stringify(stops));
  }, [stops]);

  useEffect(() => {
    if (originLocation) {
      localStorage.setItem('delivery_origin_v6', JSON.stringify(originLocation));
    } else {
      localStorage.removeItem('delivery_origin_v6');
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
      // Ordena por distância e atribui o número de ordem fixo
      const sorted = [...prev].sort((a, b) => {
        // Se ambos estiverem pendentes, ordena por distância
        if (a.status === 'pending' && b.status === 'pending') {
          return calculateDistance(origin, a) - calculateDistance(origin, b);
        }
        // Se um estiver completo, vai para o final
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (b.status === 'completed' && a.status !== 'completed') return -1;
        return 0;
      });

      // Atualiza o 'order' baseado na nova sequência otimizada
      return sorted.map((s, idx) => ({ ...s, order: idx + 1 }));
    });
  }, [originLocation, currentLocation]);

  const toggleStopStatus = (id: string) => {
    setStops(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, status: s.status === 'pending' ? 'completed' : 'pending' } : s);
      
      // Organiza a visualização: primeiro pendentes por ordem, depois completos por ordem
      const pending = updated.filter(s => s.status === 'pending').sort((a, b) => a.order - b.order);
      const completed = updated.filter(s => s.status === 'completed').sort((a, b) => a.order - b.order);
      
      return [...pending, ...completed];
    });
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput) return;
    setIsLoading(true);
    setLoadingMessage('Localizando...');
    try {
      const results = await searchAddresses(manualInput, originLocation?.address);
      if (results.length > 0) {
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
        alert("Local não encontrado.");
      }
    } catch {
      alert("Erro ao editar endereço.");
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
      setLoadingMessage('Lendo imagem...');
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
        alert("Erro ao processar imagem.");
      }
      setIsLoading(false);
    }
  };

  const selectCandidate = (c: AddressCandidate) => {
    if (selectionTarget === 'stop') {
      const nextOrder = stops.length > 0 ? Math.max(...stops.map(s => s.order)) + 1 : 1;
      setStops(prev => [...prev, { id: Date.now().toString(), address: c.address, lat: c.lat, lng: c.lng, status: 'pending', order: nextOrder }]);
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
      alert("Acesso à câmera negado.");
      setIsCapturing(false);
    }
  };

  const stopCamera = () => {
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setIsCapturing(false);
  };

  const clearAllData = () => {
    if (window.confirm("Deseja limpar todos os dados e reiniciar o app?")) {
      setStops([]);
      setOriginLocation(null);
      localStorage.clear();
      window.location.reload();
    }
  };

  const activeOrigin = originLocation || currentLocation;
  const isUsingGPS = !originLocation;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[#0b1120] text-slate-200 font-sans relative shadow-[0_0_100px_rgba(0,0,0,0.5)]">
      {!hasKey && (
        <div className="bg-amber-600 p-2 text-center text-[9px] font-black uppercase tracking-tighter">
          Aviso: Chave API Ausente
        </div>
      )}

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
            className={`p-4 rounded-2xl border flex items-center gap-4 transition-all cursor-pointer ${isUsingGPS ? 'bg-white/10 border-white/10' : 'bg-indigo-500 border-white/30'}`}
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
                {originLocation ? originLocation.address : (currentLocation ? 'Minha Localização (GPS)' : 'Buscando sinal...')}
              </p>
            </div>
            {!isUsingGPS && (
              <button onClick={(e) => { e.stopPropagation(); setOriginLocation(null); }} className="p-2 bg-white/20 rounded-lg">
                <SignalIcon className="w-5 h-5 text-white" />
              </button>
            )}
            {isUsingGPS && <PencilSquareIcon className="w-4 h-4 text-white/40" />}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-3 overflow-y-auto pb-40">
        {stops.length === 0 ? (
          <div className="py-20 text-center opacity-10 flex flex-col items-center">
            <PlusIcon className="w-12 h-12 mb-2" />
            <p className="font-black text-xs uppercase tracking-widest">Adicione Paradas</p>
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
                    <button 
                      onClick={() => toggleStopStatus(stop.id)} 
                      className={`p-2.5 rounded-xl transition-colors ${stop.status === 'completed' ? 'text-green-500 bg-green-500/10' : 'text-slate-500 bg-slate-800/50 hover:bg-slate-700'}`}
                    >
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    {stop.status === 'pending' && (
                      <button onClick={(e) => { e.stopPropagation(); setEditingStopId(stop.id); setEditInput(stop.address); setShowEditModal(true); }} className="p-2 text-slate-600">
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
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1e293b] w-full max-w-md rounded-t-[2.5rem] p-6 pb-10 border-t border-indigo-500/20 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6 opacity-50" />
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-white uppercase text-[10px] tracking-widest opacity-60 ml-2">
                {showEditModal ? 'Editar Local' : (selectionTarget === 'origin' ? 'Ponto Inicial' : 'Novo Destino')}
              </h3>
              <button onClick={() => { setShowManual(false); setShowEditModal(false); }} className="p-2 bg-slate-800/50 rounded-full text-slate-400 hover:text-white transition-colors">
                <XMarkIcon className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={showEditModal ? handleEditSubmit : handleManualSearch} className="space-y-4">
              <div className="relative">
                 <input 
                  autoFocus 
                  type="text" 
                  placeholder="Endereço Completo..." 
                  className="w-full p-4 pl-12 bg-slate-900/80 rounded-2xl outline-none border border-slate-700 text-sm font-bold text-white focus:border-indigo-500 transition-all" 
                  value={showEditModal ? editInput : manualInput} 
                  onChange={e => showEditModal ? setEditInput(e.target.value) : setManualInput(e.target.value)} 
                />
                <MapPinIcon className="w-5 h-5 text-indigo-500 absolute left-4 top-1/2 -translate-y-1/2 opacity-50" />
              </div>

              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin"/> : "Confirmar Local"}
              </button>
              
              {selectionTarget === 'origin' && !showEditModal && (
                <button 
                  type="button" 
                  onClick={() => { setOriginLocation(null); setShowManual(false); }} 
                  className="w-full py-3 text-indigo-400 text-[10px] font-black uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
                >
                  Usar Localização GPS
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {showCandidateSelection && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-[#1e293b] w-full max-w-md rounded-t-[2.5rem] p-6 pb-10 max-h-[70vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6 opacity-50" />
            <h3 className="font-black text-white mb-6 uppercase tracking-widest text-[10px] opacity-40 text-center">Confirmar Endereço</h3>
            <div className="space-y-3">
              {candidates.map((c, i) => (
                <button key={i} onClick={() => selectCandidate(c)} className="w-full p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50 text-left text-xs font-bold flex gap-4 items-center hover:border-indigo-500/50 active:bg-indigo-600/10 transition-all">
                  <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center shrink-0">
                    <MapPinIcon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="truncate text-white">{c.address}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCandidateSelection(false)} className="w-full mt-8 py-3 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:text-slate-300">Voltar</button>
          </div>
        </div>
      )}

      {isCapturing && (
        <div className="fixed inset-0 z-[130] bg-black flex flex-col max-w-md mx-auto">
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
          <div className="p-12 flex justify-between items-center bg-black/80 border-t border-white/5">
             <button onClick={stopCamera} className="text-slate-500 font-black text-[10px] tracking-widest">CANCELAR</button>
             <button onClick={handlePhotoCapture} className="w-20 h-20 bg-white rounded-full border-[6px] border-indigo-600 shadow-2xl active:scale-90 transition-transform" />
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
        body { background-color: #000; user-select: none; -webkit-tap-highlight-color: transparent; height: 100%; }
        #root { height: 100%; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;
