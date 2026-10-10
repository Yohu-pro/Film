
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { Layout } from './components/Layout';
import { VideoGenerator } from './components/VideoGenerator';
import { PromptToVoice } from './components/PromptToVoice';
import { Pricing } from './components/Pricing';
import { GenerationHistory, UserProfile, BatchResult } from './types';
import { DEFAULT_PROFILE } from './constants';
import { translate } from './i18n';

const App: React.FC = () => {
  const [outputLanguage, setOutputLanguage] = useState<'EN' | 'VN'>(() => {
    return (localStorage.getItem('veopro_lang') as 'EN' | 'VN') || 'EN';
  });

  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('veopro_profile');
    return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
  });
  
  const [activeTasks, setActiveTasks] = useState<GenerationHistory[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'promptToVoice' | 'pricing'>('generate');

  const [analyzedScript, setAnalyzedScript] = useState(() => localStorage.getItem('veopro_analyzed_script') || '');
  const [directorScript, setDirectorScript] = useState(() => localStorage.getItem('veopro_director_script') || '');
  const [seamlessScript, setSeamlessScript] = useState(() => localStorage.getItem('veopro_seamless_script') || '');
  const [targetLink, setTargetLink] = useState(() => localStorage.getItem('veopro_target_link') || '');
  
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);

  const [email, setEmail] = useState(() => localStorage.getItem('currentUserEmail') || localStorage.getItem('yohu_user_email') || '');
  const [phone, setPhone] = useState('');
  const [userPlan, setUserPlan] = useState<string>('free');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState('');
  const [isActivated, setIsActivated] = useState(false);
  const [useProjectKey, setUseProjectKey] = useState(true);
  const [credit, setCredit] = useState<number>(0);
  const [projectName, setProjectName] = useState(() => localStorage.getItem('veopro_project_name') || '');
  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('veopro_api_keys');
    return saved ? JSON.parse(saved) : [];
  });
  const [adminAllKeys, setAdminAllKeys] = useState<string[]>([]);

  useEffect(() => {
    const fetchAdminKeys = async () => {
      if (profile.role === 'admin') {
        const { data } = await supabase
          .from('users')
          .select('api_keys')
          .not('api_keys', 'is', null);
        
        if (data) {
          const allKeys = data.flatMap(u => u.api_keys || []).filter(k => k && k.trim() !== '');
          const uniqueKeys = Array.from(new Set(allKeys));
          setAdminAllKeys(uniqueKeys);
        }
      } else {
        setAdminAllKeys([]);
      }
    };
    fetchAdminKeys();
  }, [profile.role]);

  const fetchUserData = useCallback(async (targetEmail: string) => {
    if (!targetEmail) {
      setUserPlan('free');
      setCredit(5);
      return;
    }

    const cleanEmail = targetEmail.trim().toLowerCase();
    
    // 1. Try to fetch user
    console.log('Email query:', cleanEmail);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();
    
    console.log('Data users:', data);
    console.log('Error users:', error);

    if (data) {
      const now = new Date();
      const expiry = data.expires_at ? new Date(data.expires_at) : null;
      const isExpired = expiry && now > expiry;
      
      const isActive = data.is_active === true;
      const plan = data.plan || 'free';

      // Logic: Pro
      const isPro = plan === 'pro' && isActive && !isExpired;
      // Logic: Enterprise
      const isEnterprise = plan === 'enterprise' && isActive && !isExpired;
      
      setUserPlan(plan);
      setExpiresAt(data.expires_at);
      setIsActivated(isActive);
      
      // Credits logic
      if ((isPro || isEnterprise) && isActive && !isExpired) {
        setCredit(999999); // Unlimited
      } else {
        setCredit(data.free_credits ?? 5);
      }

      // Only update email/phone if they are empty to avoid overwriting user input
      if (!email) setEmail(data.email);
      if (!phone) setPhone(data.phone || '');
      
      // 3. Fetch user API keys if Pro
      let finalApiKeys = data.api_keys || [];
      if (isPro) {
        const { data: keysData } = await supabase
          .from('user_api_keys')
          .select('api_key')
          .eq('user_id', data.id)
          .eq('is_active', true);
        
        if (keysData && keysData.length > 0) {
          finalApiKeys = keysData.map(k => k.api_key);
          localStorage.setItem('veopro_api_keys', JSON.stringify(finalApiKeys));
        }
      }
      setApiKeys(finalApiKeys);
      
      const updatedProfile: UserProfile = {
        ...profile,
        email: data.email,
        phone: data.phone,
        role: data.role || 'user',
        plan_name: plan,
        plan_status: isActive ? 'active' : 'inactive',
        remaining_days: (expiry ? Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0),
        project_name: data.project_name || projectName,
        api_keys: finalApiKeys,
        useProjectKey: useProjectKey,
        accountType: plan,
        expiryDate: data.expires_at || (outputLanguage === 'VN' ? 'Vĩnh viễn' : 'Permanent'),
        is_active: data.is_active
      };
      
      setProfile(updatedProfile);
      if (data.project_name) setProjectName(data.project_name);
    } else {
      // Not found or error
      setUserPlan('free');
      setCredit(5);
    }
  }, [profile, projectName, email, phone, outputLanguage, useProjectKey]);

  const handleActivate = async () => {
    if (!email || !phone) {
      alert(outputLanguage === 'VN' ? "Vui lòng nhập email và số điện thoại" : "Please enter email and phone");
      return;
    }
    
    const cleanEmail = email.trim().toLowerCase();
    localStorage.setItem('currentUserEmail', cleanEmail);
    await fetchUserData(cleanEmail);
  };

  // Auto-save user data when both email and phone are filled
  useEffect(() => {
    if (email && email.includes('@') && email.includes('.') && phone && phone.length >= 10) {
      const timer = setTimeout(() => {
        const cleanEmail = email.trim().toLowerCase();
        supabase
          .from('users')
          .upsert({ 
            email: cleanEmail, 
            phone, 
            status: 'active',
            created_at: new Date().toISOString()
          }, { onConflict: 'email' })
          .then(({ error }) => {
            if (!error) {
              fetchUserData(cleanEmail);
              localStorage.setItem('yohu_user_email', cleanEmail);
            }
          });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [email, phone, fetchUserData]);

  // Auto-fetch user data as they type email
  useEffect(() => {
    if (email && email.includes('@') && email.includes('.') && !phone) {
      const timer = setTimeout(() => {
        fetchUserData(email);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [email, phone, fetchUserData]);

  useEffect(() => {
    const savedEmail = localStorage.getItem('currentUserEmail') || localStorage.getItem('yohu_user_email');
    if (savedEmail) {
      const t = setTimeout(() => fetchUserData(savedEmail), 0);
      return () => clearTimeout(t);
    }
  }, [fetchUserData]);

  useEffect(() => {
    if (isActivated && email) {
      localStorage.setItem('yohu_user_email', email);
    }
  }, [isActivated, email]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, [setHasApiKey]);

  // Hàm lưu an toàn tránh tràn bộ nhớ gây crash
  const safeSave = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('LocalStorage full, clearing batch results to save memory...');
        localStorage.removeItem('veopro_batch_results');
        localStorage.removeItem('veopro_history');
      }
    }
  };

  useEffect(() => { safeSave('veopro_analyzed_script', analyzedScript); }, [analyzedScript]);
  useEffect(() => { safeSave('veopro_director_script', directorScript); }, [directorScript]);
  useEffect(() => { safeSave('veopro_seamless_script', seamlessScript); }, [seamlessScript]);
  useEffect(() => { safeSave('veopro_target_link', targetLink); }, [targetLink]);
  useEffect(() => { safeSave('veopro_project_name', projectName); }, [projectName]);
  useEffect(() => { safeSave('veopro_api_keys', JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => {
    try {
      localStorage.setItem('veopro_lang', outputLanguage);
    } catch (e) {
      console.error('Failed to save language to localStorage', e);
    }
  }, [outputLanguage]);

  const deductCredit = async (amount: number) => {
    if (profile.role === 'admin' || userPlan === 'pro' || userPlan === 'enterprise') return true;
    
    if (credit < amount) {
      alert(outputLanguage === 'VN' ? "Bạn không đủ credit. Vui lòng nâng cấp gói." : "Not enough credits. Please upgrade.");
      return false;
    }

    const newCredit = credit - amount;
    setCredit(newCredit);

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase
        .from('users')
        .update({ free_credits: newCredit })
        .eq('email', cleanEmail);
      
      if (error) {
        console.error('Error deducting credit:', error);
      }
    }
    return true;
  };

  const addToHistory = (item: GenerationHistory) => {
    const newHistory = [item, ...history];
    setHistory(newHistory);
  };

  const updateProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    safeSave('veopro_profile', JSON.stringify(newProfile));
  };

  const handleOpenKeyPicker = useCallback(async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  }, [setHasApiKey]);

  const handleToggleProjectKey = async (val: boolean) => {
    setUseProjectKey(val);
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'use_project_key', value: val.toString() }, { onConflict: 'key' });
    
    if (error) {
      console.error('Error saving system setting:', error);
    }
  };

  const handleUpdateProjectConfig = async (name: string, keys: string[], targetEmail?: string) => {
    const cleanEmail = (targetEmail || email).trim().toLowerCase();
    
    if (cleanEmail === email.trim().toLowerCase()) {
      setProjectName(name);
      setApiKeys(keys);
    }
    
    if (cleanEmail) {
      // Find user_id from users table
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .single();

      if (!userData) {
        console.error('User not found for email:', cleanEmail);
        return;
      }

      // Save to customer_configs for backward compatibility
      await supabase
        .from('customer_configs')
        .upsert({
          user_id: cleanEmail,
          api_keys: keys,
          package_name: 'Gói chuyên nghiệp 1',
          is_active: false
        }, { onConflict: 'user_id' });

      // Save to user_api_keys table as requested
      // First, delete old keys for this user to sync properly
      console.log('Deleting old keys for user:', userData.id);
      await supabase
        .from('user_api_keys')
        .delete()
        .eq('user_id', userData.id);

      for (const key of keys) {
        if (!key) continue;
        console.log('Inserting key into user_api_keys:', key.substring(0, 4) + '...');
        const { error: insertError } = await supabase
          .from('user_api_keys')
          .insert({
            user_id: userData.id,
            api_key: key.trim(),
            label: 'Key Pro1',
            is_active: true
          });
        
        if (!insertError) {
          console.log('Key saved successfully to user_api_keys');
        } else {
          console.error('Error saving key to user_api_keys:', insertError);
        }
      }

      // Also update api_keys column in users table for redundancy
      await supabase
        .from('users')
        .update({ api_keys: keys })
        .eq('id', userData.id);

      alert(translate('BYOK_SUCCESS_MSG', outputLanguage));
      if (cleanEmail === email.trim().toLowerCase()) {
        await fetchUserData(email);
      }
    }
  };

  const handleAdminActivateUser = async (targetEmail: string, days: number, planType: 'pro1' | 'pro9') => {
    const isPro = userPlan.toLowerCase() === 'pro' && isActivated;
    if (profile.role !== 'admin' && !isPro) return;
    
    const cleanEmail = targetEmail.trim().toLowerCase();
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + days);

    const { error } = await supabase
      .from('users')
      .update({
        plan: planType === 'pro1' ? 'pro' : 'enterprise',
        expires_at: expiryDate.toISOString(),
        is_active: true,
        free_credits: planType === 'pro1' ? 1000 : 999999
      })
      .eq('email', cleanEmail);

    if (error) {
      alert("Error activating user: " + error.message);
    } else {
      alert(outputLanguage === 'VN' ? "Kích hoạt thành công" : "Activation successful");
      await fetchUserData(cleanEmail);
    }
  };

  const handleAdminTogglePro = async (targetEmail: string, field: 'pro1_enabled' | 'pro9_enabled', value: boolean) => {
    const isAdmin = profile.role === 'admin';

    if (!isAdmin) return;
    
    const cleanEmail = targetEmail.trim().toLowerCase();
    const plan = field === 'pro1_enabled' ? 'pro' : 'enterprise';

    console.log(`Admin toggling ${field} for ${cleanEmail} to ${value}`);

    const { error } = await supabase
      .from('users')
      .update({
        plan: value ? plan : 'free',
        is_active: value
      })
      .eq('email', cleanEmail);

    if (error) {
      console.error("Error updating user:", error);
      alert("Error updating user: " + error.message);
    } else {
      console.log("User updated successfully");
      await fetchUserData(cleanEmail);
    }
  };

  const onAdminFetchUser = async (targetEmail: string) => {
    const isAdmin = profile.role === 'admin';

    if (!isAdmin) return null;
    
    const cleanEmail = targetEmail.trim().toLowerCase();
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();
    
    if (data) {
      const now = new Date();
      const expiry = data.expires_at ? new Date(data.expires_at) : null;
      const isExpired = expiry && now > expiry;

      return {
        ...data,
        pro1_enabled: data.plan === 'pro' && data.is_active && !isExpired,
        pro9_enabled: data.plan === 'enterprise' && data.is_active && !isExpired
      };
    }
    return null;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (!isActivated || email !== session.user.email) {
          await fetchUserData(session.user.email!);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsActivated(false);
        setProfile(DEFAULT_PROFILE);
        localStorage.removeItem('yohu_user_email');
      }
    });

    return () => subscription.unsubscribe();
  }, [outputLanguage, fetchUserData, isActivated, email]);

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      profile={profile}
      onProfileUpdate={updateProfile}
      usageCount={history.length}
      outputLanguage={outputLanguage}
      setOutputLanguage={setOutputLanguage}
      email={email}
      setEmail={setEmail}
      phone={phone}
      setPhone={setPhone}
      userPlan={userPlan as any}
      expiresAt={expiresAt}
      customApiKey={customApiKey}
      setCustomApiKey={setCustomApiKey}
      onActivate={handleActivate}
      credit={credit}
      projectName={projectName}
      apiKeys={apiKeys}
      onUpdateProjectConfig={handleUpdateProjectConfig}
      onAdminActivateUser={handleAdminActivateUser}
      onAdminTogglePro={handleAdminTogglePro}
      onAdminFetchUser={onAdminFetchUser}
      useProjectKey={useProjectKey}
      onToggleProjectKey={handleToggleProjectKey}
      onOpenPricing={() => setActiveTab('pricing')}
    >
      <div className={activeTab === 'generate' ? 'contents' : 'hidden'}>
        <VideoGenerator 
          onGenerated={addToHistory} 
          history={history} 
          onOpenPricing={() => setActiveTab('pricing')}
          profile={profile}
          onKeyError={() => setHasApiKey(false)}
          activeTasks={activeTasks}
          setActiveTasks={setActiveTasks}
          analyzedScript={analyzedScript}
          setAnalyzedScript={setAnalyzedScript}
          directorScript={directorScript}
          setDirectorScript={setDirectorScript}
          seamlessScript={seamlessScript}
          setSeamlessScript={setSeamlessScript}
          targetLink={targetLink}
          setTargetLink={setTargetLink}
          batchResults={batchResults}
          setBatchResults={setBatchResults}
          outputLanguage={outputLanguage}
          setOutputLanguage={setOutputLanguage}
          userPlan={userPlan as any}
          credit={credit}
          setCredit={setCredit}
          email={email}
          phone={phone}
          projectName={projectName}
          apiKeys={profile.role === 'admin' ? [...apiKeys, ...adminAllKeys] : apiKeys}
          hasApiKey={hasApiKey}
          onOpenKeyPicker={handleOpenKeyPicker}
          deductCredit={deductCredit}
        />
      </div>

      <div className={activeTab === 'promptToVoice' ? 'contents' : 'hidden'}>
        <PromptToVoice 
          outputLanguage={outputLanguage}
          profile={profile}
          useProjectKey={useProjectKey}
          deductCredit={deductCredit}
        />
      </div>

      {activeTab === 'pricing' && (
        <Pricing 
          onClose={() => setActiveTab('generate')} 
          onUpdateProfile={updateProfile}
          currentProfile={profile}
          outputLanguage={outputLanguage}
        />
      )}
    </Layout>
  );
};

export default App;
