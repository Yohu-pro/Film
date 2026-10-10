
import React from 'react';
import { UserProfile } from '../types';
import { translate } from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'generate' | 'promptToVoice' | 'pricing';
  setActiveTab: (tab: 'generate' | 'promptToVoice' | 'pricing') => void;
  profile: UserProfile;
  onProfileUpdate: (newProfile: UserProfile) => void;
  usageCount: number;
  outputLanguage: 'EN' | 'VN';
  setOutputLanguage: (lang: 'EN' | 'VN') => void;
  email: string;
  setEmail: (email: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  userPlan: 'free' | 'pro' | 'enterprise';
  expiresAt: string | null;
  customApiKey: string;
  setCustomApiKey: (key: string) => void;
  onActivate: () => void;
  credit: number;
  projectName: string;
  apiKeys: string[];
  onUpdateProjectConfig: (name: string, keys: string[], email?: string) => void;
  onAdminActivateUser: (email: string, days: number, planType: 'pro1' | 'pro9') => Promise<void>;
  onAdminTogglePro: (email: string, field: 'pro1_enabled' | 'pro9_enabled', value: boolean) => Promise<void>;
  onAdminFetchUser: (email: string) => Promise<any>;
  onOpenPricing: () => void;
  useProjectKey: boolean;
  onToggleProjectKey: (val: boolean) => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  profile,
  outputLanguage,
  setOutputLanguage,
  email,
  setEmail,
  phone,
  setPhone,
  userPlan,
  expiresAt,
  onActivate,
  credit,
  projectName,
  apiKeys,
  onUpdateProjectConfig,
  onAdminActivateUser,
  onAdminTogglePro,
  onAdminFetchUser,
  onOpenPricing,
  useProjectKey,
  onToggleProjectKey
}) => {
  const [showConfigModal, setShowConfigModal] = React.useState(false);
  const [tempProjectName, setTempProjectName] = React.useState(projectName);
  const [tempApiKeys, setTempApiKeys] = React.useState(apiKeys.join('\n'));
  const [adminUserEmail, setAdminUserEmail] = React.useState('');
  const [adminDays, setAdminDays] = React.useState(30);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = React.useState(false);
  const [targetUserStatus, setTargetUserStatus] = React.useState<{
    pro1_enabled: boolean, 
    pro9_enabled: boolean,
    plan?: string,
    expires_at?: string | null,
    is_active?: boolean
  } | null>(null);

  React.useEffect(() => {
    if (!showConfigModal) {
      setTempProjectName(projectName);
      setTempApiKeys(apiKeys.join('\n'));
    }
  }, [projectName, apiKeys, showConfigModal]);

  const handleSaveConfig = () => {
    if (profile.role !== 'admin' && userPlan.toLowerCase() === 'free') {
      alert(translate('PAID_PLAN_REQUIRED', outputLanguage));
      onOpenPricing();
      return;
    }
    const keys = tempApiKeys.split('\n').map(k => k.trim()).filter(k => k !== '');
    console.log('Saving project config:', { tempProjectName, keys, email });
    onUpdateProjectConfig(tempProjectName, keys, email);
    setShowConfigModal(false);
  };

  React.useEffect(() => {
    const fetchTargetUser = async () => {
      if (adminUserEmail && adminUserEmail.includes('@')) {
        const userData = await onAdminFetchUser(adminUserEmail);
        if (userData) {
          setTargetUserStatus({
            pro1_enabled: userData.pro1_enabled || false,
            pro9_enabled: userData.pro9_enabled || false,
            plan: userData.plan,
            expires_at: userData.expires_at,
            is_active: userData.is_active
          });
        } else {
          setTargetUserStatus(null);
        }
      } else {
        setTargetUserStatus(null);
      }
    };
    fetchTargetUser();
  }, [adminUserEmail, onAdminFetchUser]);

  const handleAdminToggle = async (field: 'pro1_enabled' | 'pro9_enabled') => {
    if (!adminUserEmail || !targetUserStatus) return;
    const newValue = !targetUserStatus[field];
    await onAdminTogglePro(adminUserEmail, field, newValue);
    setTargetUserStatus(prev => prev ? { ...prev, [field]: newValue } : null);
  };

  const handleAdminActivate = async (planType: 'pro1' | 'pro9') => {
    if (!adminUserEmail) return;
    await onAdminActivateUser(adminUserEmail, adminDays, planType);
    // Refresh status
    const userData = await onAdminFetchUser(adminUserEmail);
    if (userData) {
      setTargetUserStatus({
        pro1_enabled: userData.pro1_enabled || false,
        pro9_enabled: userData.pro9_enabled || false
      });
    }
  };
  const isPro = userPlan === 'pro' && profile.is_active && (expiresAt ? new Date(expiresAt) > new Date() : true);
  const isEnterprise = userPlan === 'enterprise' && profile.is_active && (expiresAt ? new Date(expiresAt) > new Date() : true);
  const isAdmin = profile.role === 'admin';

  return (
    <div className="flex flex-col min-h-screen bg-[#f1f5f9] text-slate-800">
      <header className="bg-white border-b border-slate-200 px-4 py-1 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-blue-700 tracking-tighter uppercase italic leading-none">Veo3 YOHU-pro</h1>
            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Cinema Pro Continuity Engine</span>
          </div>
          <nav className="flex space-x-1">
            <button 
              onClick={() => setActiveTab('promptToVoice')}
              className={`px-6 py-2 rounded-full text-[10px] leading-tight font-black uppercase tracking-widest transition-all active:scale-95 whitespace-pre-line text-center ${activeTab === 'promptToVoice' ? 'bg-blue-600 text-white shadow-lg' : 'text-red-600 hover:bg-slate-50'}`}
            >
              {translate('PROMPT_TO_VOICE', outputLanguage)}
            </button>
            <button 
              onClick={() => setActiveTab('generate')}
              className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${activeTab === 'generate' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {translate('CREATE_VIDEO', outputLanguage)}
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-6">
          {/* Activation Section */}
          <div className="flex items-center space-x-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center space-x-2">
                <input
                  type="email"
                  placeholder={translate('EMAIL_PLACEHOLDER', outputLanguage)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border border-slate-200 px-2 py-1.5 rounded-md text-[10px] w-32 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-bold"
                />
                <input
                  type="text"
                  placeholder={translate('PHONE_PLACEHOLDER', outputLanguage)}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="border border-slate-200 px-2 py-1.5 rounded-md text-[10px] w-24 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-bold"
                />
                <button
                  onClick={onActivate}
                  disabled={!email || !phone}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ${(!email || !phone) ? 'bg-slate-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                >
                  {(isAdmin || isPro || isEnterprise) ? translate('DONE', outputLanguage) : translate('ACTIVATE_BTN', outputLanguage)}
                </button>
              </div>
              {email && (
                <div className="flex items-center space-x-3 px-1">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shadow-sm ${(isPro || isEnterprise || isAdmin) ? 'bg-amber-600 text-white' : 'bg-gradient-to-r from-[#8B93FF] to-[#5755FE] text-white'}`}>
                    {translate('PLAN_LABEL', outputLanguage)}: <span className="text-white">
                      {isPro ? translate('PROFESSIONAL_PACKAGE_1', outputLanguage) :
                       isEnterprise ? translate('PROFESSIONAL_PACKAGE_9', outputLanguage) :
                       'PLAN FREE'}
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-gradient-to-r from-[#8B93FF] to-[#5755FE] text-white text-[8px] font-black uppercase tracking-tighter shadow-sm">
                    {translate('CREDITS_LABEL', outputLanguage)}: <span className="text-white">
                      {(isPro || isEnterprise || isAdmin) ? (outputLanguage === 'VN' ? 'Vô hạn' : 'UNLIMITED') : 
                       credit}
                    </span>
                  </span>
                  {expiresAt && (
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                      {translate('EXPIRES_LABEL', outputLanguage)}: <span className="text-slate-600">{new Date(expiresAt).toLocaleDateString()}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1">
              <button 
                onClick={() => {
                  if (isPro) {
                    setShowConfigModal(true);
                  } else {
                    onOpenPricing();
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${isPro ? 'bg-green-500 text-white' : 'bg-gradient-to-r from-indigo-600 to-blue-700 text-white border-blue-700'}`}
              >
                {translate('PROFESSIONAL_PACKAGE_1', outputLanguage)}
              </button>
              <button 
                onClick={() => {
                  if (isEnterprise) {
                    setShowConfigModal(true);
                  } else {
                    onOpenPricing();
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${isEnterprise ? 'bg-green-500 text-white' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-orange-700'}`}
              >
                {translate('PROFESSIONAL_PACKAGE_9', outputLanguage)}
              </button>
            </div>
            {!(isPro || isEnterprise) && (
              <span className="text-[8px] font-black text-green-500 uppercase tracking-tighter">
                {translate('CREDIT_INFO', outputLanguage)}
              </span>
            )}
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200 shadow-inner mb-1">
              <button 
                onClick={() => setOutputLanguage('VN')} 
                className={`px-3 py-1 rounded-full text-[8px] font-black transition-all ${outputLanguage === 'VN' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                VN
              </button>
              <button 
                onClick={() => setOutputLanguage('EN')} 
                className={`px-3 py-1 rounded-full text-[8px] font-black transition-all ${outputLanguage === 'EN' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                EN
              </button>
            </div>
            {profile.role === 'admin' && (
              <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 shadow-inner">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">{translate('USE_PROJECT_KEY', outputLanguage)}</span>
                <button 
                  onClick={() => onToggleProjectKey(!useProjectKey)}
                  className={`w-8 h-4 rounded-full transition-all relative ${useProjectKey ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${useProjectKey ? 'left-4.5' : 'left-0.5'}`} />
                </button>
                <span className="text-[8px] font-black text-slate-700 uppercase">{useProjectKey ? 'ON' : 'OFF'}</span>
              </div>
            )}
            {profile.role !== 'admin' && (
              <>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID: {profile.machineId}</div>
                <div className="text-[9px] font-bold text-green-500 uppercase tracking-widest animate-pulse">{translate('SYSTEM_ONLINE', outputLanguage)}</div>
              </>
            )}
            {isAdmin && (
              <button 
                onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                className="text-[8px] font-black text-indigo-600 uppercase underline mt-1"
              >
                {translate('ADMIN_PANEL', outputLanguage)}
              </button>
            )}
          </div>
        </div>
      </header>

      {isAdminPanelOpen && (profile.role === 'admin' || (userPlan.toLowerCase() === 'pro' && profile.is_active)) && (
        <div className="bg-indigo-900 text-white px-4 py-2 flex items-center justify-between border-b border-indigo-800 shadow-xl animate-in slide-in-from-top duration-300">
            <div className="flex items-center space-x-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest italic">{translate('ADMIN_PANEL', outputLanguage)}</h2>
            
            <div className="flex items-center space-x-2 border-r border-indigo-700 pr-4">
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-indigo-300 uppercase">{translate('USER_EMAIL_LBL', outputLanguage)}</label>
                <input 
                  type="email" 
                  value={adminUserEmail}
                  onChange={(e) => setAdminUserEmail(e.target.value)}
                  className="bg-indigo-800 border border-indigo-700 rounded px-2 py-1 text-[10px] outline-none focus:border-indigo-500 w-48 font-bold"
                  placeholder="user@example.com"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[8px] font-bold text-indigo-300 uppercase">{translate('DAYS_LBL', outputLanguage)}</label>
                <input 
                  type="number" 
                  value={adminDays}
                  onChange={(e) => setAdminDays(parseInt(e.target.value) || 0)}
                  className="bg-indigo-800 border border-indigo-700 rounded px-2 py-1 text-[10px] outline-none focus:border-indigo-500 w-16 text-center font-bold"
                />
              </div>
            </div>

            <div className="flex items-center space-x-8">
              {targetUserStatus && (
                <div className="flex flex-col border-r border-indigo-700 pr-4">
                  <span className="text-[8px] font-bold text-indigo-300 uppercase">Current Status</span>
                  <span className="text-[10px] font-black text-emerald-400 uppercase">
                    {targetUserStatus.plan} ({targetUserStatus.is_active ? 'Active' : 'Inactive'})
                  </span>
                  {targetUserStatus.expires_at && (
                    <span className="text-[8px] font-bold text-indigo-200">
                      Exp: {new Date(targetUserStatus.expires_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[8px] font-black text-indigo-100 uppercase tracking-widest">{translate('PROFESSIONAL_PACKAGE_1', outputLanguage)}</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleAdminToggle('pro1_enabled')}
                      disabled={!targetUserStatus}
                      className={`w-10 h-5 rounded-full transition-all relative ${targetUserStatus?.pro1_enabled ? 'bg-emerald-500' : 'bg-indigo-700'} ${!targetUserStatus && 'opacity-30 cursor-not-allowed'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${targetUserStatus?.pro1_enabled ? 'left-6' : 'left-1'}`} />
                    </button>
                    <button 
                      onClick={() => handleAdminActivate('pro1')}
                      className="bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded text-[8px] font-black uppercase transition-colors"
                    >
                      {translate('ACTIVATE_BTN', outputLanguage)}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[8px] font-black text-indigo-100 uppercase tracking-widest">{translate('PROFESSIONAL_PACKAGE_9', outputLanguage)}</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleAdminToggle('pro9_enabled')}
                      disabled={!targetUserStatus}
                      className={`w-10 h-5 rounded-full transition-all relative ${targetUserStatus?.pro9_enabled ? 'bg-emerald-500' : 'bg-indigo-700'} ${!targetUserStatus && 'opacity-30 cursor-not-allowed'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${targetUserStatus?.pro9_enabled ? 'left-6' : 'left-1'}`} />
                    </button>
                    <button 
                      onClick={() => handleAdminActivate('pro9')}
                      className="bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded text-[8px] font-black uppercase transition-colors"
                    >
                      {translate('ACTIVATE_BTN', outputLanguage)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={() => setIsAdminPanelOpen(false)} className="text-indigo-300 hover:text-white transition-colors">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {children}
      </div>
      
          <footer className="bg-white border-t border-slate-200 px-4 py-1.5 text-[8px] text-slate-500 font-medium flex justify-between items-center shadow-inner flex-shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-blue-600 font-black italic uppercase tracking-widest">{translate('STUDIO_STATUS', outputLanguage)}</span>
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-black text-[8px] uppercase tracking-tighter shadow-sm">{translate('READY', outputLanguage)}</span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1">
             <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border transition-colors cursor-default bg-indigo-50 text-indigo-600 border-indigo-100">{translate('TRIAL_INFO', outputLanguage)}</span>
             {profile.plan_name === 'Pro 1' && <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border border-emerald-100 hover:bg-emerald-100 transition-colors cursor-default">{translate('LICENSE_ACTIVE', outputLanguage)}</span>}
             {profile.plan_name === 'Pro 9' && <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border border-blue-100 hover:bg-blue-100 transition-colors cursor-default">{translate('LICENSE_PREMIUM', outputLanguage)}</span>}
          </div>
        </div>
        <div className="opacity-40 font-black text-[9px] tracking-[0.4em]">V3.1.0-CINEMA-PRO-STATION</div>
      </footer>

      {/* Project Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-[#1a1a1a] w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden text-white">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-black uppercase tracking-widest italic">{translate('CHOOSE_PAID_KEY_TITLE', outputLanguage)}</h2>
                <button onClick={() => setShowConfigModal(false)} className="text-white/40 hover:text-white transition">✕</button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('USER_EMAIL_LBL', outputLanguage)}</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={translate('EMAIL_PLACEHOLDER', outputLanguage)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('CHOOSE_PAID_PROJECT_LABEL', outputLanguage)}</label>
                  <input 
                    type="text" 
                    value={tempProjectName}
                    onChange={(e) => setTempProjectName(e.target.value)}
                    placeholder={translate('PROJECT_NAME_LABEL', outputLanguage)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('KEY_LIST_LABEL', outputLanguage)}</label>
                  <textarea 
                    autoFocus
                    value={tempApiKeys}
                    onChange={(e) => {
                      console.log('Key input change:', e.target.value);
                      setTempApiKeys(e.target.value);
                    }}
                    onPaste={() => {
                      console.log('Key input paste detected');
                    }}
                    placeholder={translate('KEY_PLACEHOLDER', outputLanguage)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-mono outline-none focus:border-blue-500 transition h-32 resize-none text-white selection:bg-blue-500/30"
                  />
                  <p className="text-[8px] text-white/30 italic">{translate('KEY_HINT', outputLanguage)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex flex-col items-start gap-2">
                  <button 
                    onClick={() => {
                      if (confirm(translate('CLEAR_CACHE_CONFIRM', outputLanguage))) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-400 transition"
                  >
                    {translate('CLEAR_CACHE', outputLanguage)}
                  </button>
                  <button 
                    onClick={() => { setTempProjectName(''); setTempApiKeys(''); }}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-white/40 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition"
                  >
                    {translate('RESET', outputLanguage)}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowConfigModal(false)}
                    className="px-6 py-2 rounded-xl text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white transition"
                  >
                    {translate('CANCEL', outputLanguage)}
                  </button>
                  <button 
                    onClick={handleSaveConfig}
                    className="px-8 py-2 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition shadow-lg"
                  >
                    {translate('DONE', outputLanguage)}
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white/5 p-4 text-center">
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:underline">
                {translate('BILLING_DOCS', outputLanguage)}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
