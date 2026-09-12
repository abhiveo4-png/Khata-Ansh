import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Key, 
  Send, 
  Copy, 
  Check, 
  X, 
  Sparkles, 
  UserPlus, 
  LogIn, 
  ShieldCheck, 
  Bot,
  RefreshCw,
  Users,
  LogOut,
  UserCheck,
  UserX,
  Heart,
  Share2,
  Trash2,
  Edit2,
  PlusCircle,
  Cpu,
  Radio,
  Zap,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { UserProfile, LinkedMember, PendingMemberRequest } from '../types';
import { safeFetchJson, setAuthSession } from '../utils/api';

interface AuthModalProps {
  currentUser: UserProfile | null;
  allUsers: UserProfile[];
  isOpen: boolean;
  onClose: () => void;
  onSelectUser?: (user: UserProfile, token?: string) => void;
  onLogin?: (user: UserProfile, token?: string) => void;
  onRegister?: (name: string, email: string, password?: string) => Promise<UserProfile | null>;
  onRefreshUsers: () => Promise<void>;
  onLogout?: () => void;
  botUsername?: string;
  initialTab?: 'family' | 'switch' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  allUsers,
  isOpen,
  onClose,
  onSelectUser,
  onLogin,
  onRegister,
  onRefreshUsers,
  onLogout,
  botUsername = 'khata_ansh_bot',
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'family' | 'switch' | 'register'>(
    initialTab || (currentUser ? 'family' : 'switch')
  );
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // Change password in My Account state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // UI helpers
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Editing alias state
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [roleInput, setRoleInput] = useState<'owner' | 'family' | 'partner' | 'member'>('family');

  // Manual add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberChatId, setNewMemberChatId] = useState('');
  const [newMemberName, setNewMemberName] = useState('');

  // Track modal open state to only initialize tab on open transition, NOT on background polling
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    // Only execute tab reset when modal transitions from closed to open
    if (isOpen && !prevIsOpenRef.current) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else if (currentUser) {
        setActiveTab('family');
      } else {
        setActiveTab('switch');
      }
      setError('');
      setPasswordSuccess('');
      setShowChangePassword(false);
      setEditingMemberId(null);
      setShowAddMember(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialTab, currentUser]);

  if (!isOpen) return null;

  const handleSelect = (user: UserProfile, token?: string) => {
    if (token) {
      setAuthSession(user.id, token);
    }
    if (onSelectUser) {
      onSelectUser(user, token);
    } else if (onLogin) {
      onLogin(user, token);
    }
  };

  const handleCopyLinkCode = () => {
    if (currentUser?.linkCode) {
      navigator.clipboard.writeText(`/link ${currentUser.linkCode}`);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyInviteMessage = () => {
    if (currentUser?.linkCode) {
      const inviteText = `⚡ Join our shared Cyber Expense Ledger on Telegram!\n\n1. Open @${botUsername} in Telegram\n2. Send this command to link to our shared account:\n/link ${currentUser.linkCode}\n\nAny expenses you send (e.g. 500 sabzi cash, 300 petrol upi) will be ingested into our shared ledger!`;
      navigator.clipboard.writeText(inviteText);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    }
  };

  const handleRegenerateCode = async () => {
    if (!currentUser) return;
    if (!window.confirm('Regenerate Link Code? Existing connected Telegram chats will stay connected, but new members will need the new code.')) {
      return;
    }
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ success?: boolean; linkCode?: string; user?: UserProfile }>('/api/auth/regenerate-linkcode', {
        method: 'POST',
      });
      if (data?.user) {
        await onRefreshUsers();
        if (onSelectUser) onSelectUser(data.user);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMemberAlias = async (memberId: string) => {
    if (!aliasInput.trim()) return;
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ success?: boolean; members?: LinkedMember[] }>('/api/auth/members/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          customAlias: aliasInput.trim(),
          role: roleInput,
        }),
      });
      if (data?.success) {
        setEditingMemberId(null);
        await onRefreshUsers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlinkMember = async (memberId: string, memberName: string) => {
    if (!window.confirm(`Disconnect "${memberName}" from this shared ledger?`)) return;
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ success?: boolean; members?: LinkedMember[]; user?: UserProfile }>(`/api/auth/members/${memberId}`, {
        method: 'DELETE',
      });
      if (data?.success) {
        await onRefreshUsers();
        if (data.user && onSelectUser) onSelectUser(data.user);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberChatId.trim()) return;
    setLoading(true);
    try {
      const { data } = await safeFetchJson<{ success?: boolean; user?: UserProfile }>('/api/auth/link-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: newMemberChatId.trim(),
          name: newMemberName.trim() || 'Family Member',
        }),
      });
      if (data?.user) {
        setShowAddMember(false);
        setNewMemberChatId('');
        setNewMemberName('');
        await onRefreshUsers();
        if (onSelectUser) onSelectUser(data.user);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setLoading(true);
    try {
      const { data, error: apiErr } = await safeFetchJson<{ success?: boolean; user?: UserProfile; message?: string }>(
        '/api/auth/members/approve-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        }
      );
      if (data?.user) {
        await onRefreshUsers();
        if (onSelectUser) onSelectUser(data.user);
      } else if (apiErr) {
        setError(apiErr);
      }
    } catch (err) {
      console.error('Failed to approve member request:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    setLoading(true);
    try {
      const { data, error: apiErr } = await safeFetchJson<{ success?: boolean; user?: UserProfile }>(
        '/api/auth/members/reject-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        }
      );
      if (data?.user) {
        await onRefreshUsers();
        if (onSelectUser) onSelectUser(data.user);
      } else if (apiErr) {
        setError(apiErr);
      }
    } catch (err) {
      console.error('Failed to reject member request:', err);
    } finally {
      setLoading(false);
    }
  };

  // Secure Login with Email + Password/PIN
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!loginPassword.trim()) {
      setError('Please enter your password or Security PIN to unlock the vault');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { data, error: apiErr } = await safeFetchJson<{ success?: boolean; user?: UserProfile; token?: string; error?: string }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: loginEmail.trim(),
          password: loginPassword.trim() 
        }),
      });

      if (apiErr || data?.error || !data?.user) {
        setError(data?.error || apiErr || 'Authentication failed. Please check your credentials.');
        return;
      }

      setPasswordSuccess(`Vault Unlocked: ${data.user.name}`);
      handleSelect(data.user, data.token);
      setTimeout(() => {
        onClose();
      }, 400);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Register New User with Password/PIN
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName.trim() || !registerEmail.trim()) {
      setError('Please fill in your name and email');
      return;
    }
    if (!registerPassword.trim() || registerPassword.trim().length < 4) {
      setError('Please set a password or PIN of at least 4 characters/digits');
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError('Password and Confirm Password do not match');
      return;
    }

    setError('');
    setLoading(true);
    try {
      let createdUser: UserProfile | null = null;
      let createdToken: string | undefined = undefined;

      if (typeof onRegister === 'function') {
        createdUser = await onRegister(registerName.trim(), registerEmail.trim(), registerPassword.trim());
      } else {
        const { data, error: apiErr } = await safeFetchJson<{ success?: boolean; user?: UserProfile; token?: string; error?: string }>('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: registerName.trim(), 
            email: registerEmail.trim(),
            password: registerPassword.trim()
          }),
        });

        if (apiErr || data?.error) {
          throw new Error(data?.error || apiErr || 'Registration failed');
        }

        if (data?.user) {
          createdUser = data.user;
          createdToken = data.token;
          await onRefreshUsers();
        }
      }

      if (createdUser) {
        handleSelect(createdUser, createdToken);
        setActiveTab('family');
        setRegisterName('');
        setRegisterEmail('');
        setRegisterPassword('');
        setRegisterConfirmPassword('');
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Change Password Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPasswordSuccess('');

    if (!newPassword.trim() || newPassword.trim().length < 4) {
      setError('New password must be at least 4 characters or digits long');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setLoading(true);
    try {
      const { data, error: apiErr } = await safeFetchJson<{ success?: boolean; message?: string; error?: string }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim()
        }),
      });

      if (apiErr || data?.error) {
        setError(data?.error || apiErr || 'Failed to update password');
        return;
      }

      setPasswordSuccess('Master Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordSuccess('');
      }, 2000);
      await onRefreshUsers();
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const linkedMembers: LinkedMember[] = currentUser?.linkedMembers || (
    currentUser?.telegramChatId ? [
      {
        id: `mem_${currentUser.telegramChatId}`,
        name: currentUser.telegramUsername || currentUser.name,
        customAlias: `${currentUser.name} (Owner)`,
        role: 'owner',
        telegramChatId: currentUser.telegramChatId,
        telegramUsername: currentUser.telegramUsername,
        linkedAt: currentUser.createdAt,
      }
    ] : []
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090d18] border border-cyan-500/30 rounded-3xl max-w-xl w-full shadow-2xl shadow-cyan-950/50 overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Cyber Header */}
        <div className="bg-gradient-to-r from-cyan-950/80 via-slate-900 to-indigo-950/80 p-6 text-white border-b border-cyan-500/20 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white font-display">SECURE VAULT AUTHENTICATION</h3>
                <p className="text-xs text-slate-400 font-mono">Password protected multi-user matrix & ledger routing</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl mt-5 text-xs font-mono border border-slate-800">
            {currentUser && (
              <button
                onClick={() => {
                  setActiveTab('family');
                  setError('');
                }}
                className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                  activeTab === 'family' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Heart className="w-3.5 h-3.5" />
                <span>MY VAULT ({currentUser.name})</span>
              </button>
            )}
            <button
              onClick={() => {
                setActiveTab('switch');
                setError('');
              }}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeTab === 'switch' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{currentUser ? 'SWITCH / LOG IN' : 'LOG IN / UNLOCK'}</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('register');
                setError('');
              }}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                activeTab === 'register' ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>NEW ACCOUNT</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 max-h-[75vh] overflow-y-auto font-mono text-xs">
          {/* TAB 1: SHARED ACCOUNT & FAMILY MEMBERS */}
          {activeTab === 'family' && currentUser && (
            <div className="space-y-5">
              
              {/* Active User Summary */}
              <div className="flex items-center space-x-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-lg shrink-0">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-sm text-white font-display truncate">{currentUser.name}</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                      SECURE VAULT OPEN
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                  <p className="text-[11px] text-cyan-400 font-medium mt-0.5 flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{linkedMembers.length} TELEGRAM {linkedMembers.length === 1 ? 'MEMBER' : 'MEMBERS'} CONNECTED</span>
                  </p>
                </div>
              </div>

              {/* Security & Password Settings Card */}
              <div className="bg-[#0c1426] border border-cyan-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-cyan-200 uppercase">VAULT SECURITY & PASSWORD</span>
                  </div>
                  <button
                    onClick={() => {
                      setShowChangePassword(!showChangePassword);
                      setError('');
                      setPasswordSuccess('');
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    {showChangePassword ? 'HIDE' : 'CHANGE PASSWORD / PIN'}
                  </button>
                </div>

                <div className="flex items-center justify-between bg-slate-950/70 px-3.5 py-2.5 rounded-xl border border-slate-800">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span>Status: <strong className="text-emerald-400">Password / PIN Protected</strong></span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold">
                    ACTIVE
                  </span>
                </div>

                {showChangePassword && (
                  <form onSubmit={handleChangePassword} className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-3 mt-2">
                    <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <Key className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Update Security Password / Master PIN</span>
                    </div>

                    {error && (
                      <div className="bg-rose-950/80 border border-rose-500/40 text-rose-300 px-3 py-1.5 rounded-lg text-[11px]">
                        {error}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg text-[11px] flex items-center space-x-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>{passwordSuccess}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">Current Password (if set)</label>
                      <input
                        type="password"
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-hidden focus:border-cyan-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 uppercase mb-1">New Password / PIN *</label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            required
                            placeholder="Min 4 chars / digits"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full pl-3 pr-8 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-hidden focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          >
                            {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 uppercase mb-1">Confirm New Password *</label>
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          placeholder="Confirm new password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white outline-hidden focus:border-cyan-400"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowChangePassword(false)}
                        className="px-3 py-1 text-slate-400 hover:text-white text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg font-bold text-xs"
                      >
                        {loading ? 'Saving...' : 'Save Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Shared Link Code Banner */}
              <div className="bg-[#0c1426] border border-cyan-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Key className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-cyan-200 uppercase">SHARED TELEGRAM LINK CODE</span>
                  </div>
                  <button
                    onClick={handleRegenerateCode}
                    className="text-[10px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    REGENERATE
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-xl flex items-center justify-between font-mono text-lg font-black text-cyan-300 tracking-widest">
                    <span>{currentUser.linkCode || '838107'}</span>
                    <span className="text-xs text-slate-500 font-normal tracking-normal">
                      /link {currentUser.linkCode || '838107'}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyLinkCode}
                    className="px-3.5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all shrink-0 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode ? 'COPIED' : 'COPY'}</span>
                  </button>
                  <button
                    onClick={handleCopyInviteMessage}
                    className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-all shrink-0 cursor-pointer"
                  >
                    {copiedInvite ? <Check className="w-4 h-4 stroke-[3]" /> : <Share2 className="w-4 h-4" />}
                    <span>{copiedInvite ? 'DONE!' : 'SHARE'}</span>
                  </button>
                </div>

                {/* Cyber Onboarding Guide */}
                <div className="text-[11px] text-slate-300 bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <p className="font-bold text-cyan-300 flex items-center space-x-1">
                    <span>📡 Instructions for Wife & Family Members:</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1 font-mono">
                    <li>Open Telegram and search for <b className="text-white">@{botUsername}</b></li>
                    <li>Send this message: <code className="bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded font-bold">/link {currentUser.linkCode}</code></li>
                    <li>Done! You (Owner) will receive an approval prompt here and in Telegram before they get access.</li>
                  </ol>
                </div>
              </div>

              {/* Pending Join Requests (Owner Approval Queue) */}
              {currentUser.pendingRequests && currentUser.pendingRequests.length > 0 && (
                <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                        PENDING JOIN REQUESTS ({currentUser.pendingRequests.length})
                      </span>
                    </div>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                      Owner Approval Required
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300">
                    Naye members ne link code use karke judne ki request bheji hai. Approve karne par hi wo khate me add honge:
                  </p>

                  <div className="space-y-2">
                    {currentUser.pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 bg-slate-950/90 rounded-xl border border-amber-500/30 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold flex items-center justify-center text-xs shrink-0">
                            {req.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                              <span>{req.name}</span>
                              {req.telegramUsername && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  @{req.telegramUsername}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Chat ID: {req.chatId} • {new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            onClick={() => handleApproveRequest(req.id)}
                            disabled={loading}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1 transition-all shadow-sm cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req.id)}
                            disabled={loading}
                            className="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Telegram Members List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>CONNECTED TELEGRAM CLIENTS ({linkedMembers.length})</span>
                  </h4>
                  <button
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>MANUAL LINK</span>
                  </button>
                </div>

                {/* Optional Manual Add Form */}
                {showAddMember && (
                  <form onSubmit={handleAddManualMember} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                    <div className="text-xs font-bold text-white">Manual Telegram Chat ID Ingestion</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Chat ID (e.g. 838107368)"
                        value={newMemberChatId}
                        onChange={(e) => setNewMemberChatId(e.target.value)}
                        required
                        className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-hidden"
                      />
                      <input
                        type="text"
                        placeholder="Member Label (e.g. Wife, Pooja)"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-hidden"
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowAddMember(false)}
                        className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        ABORT
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-3 py-1 bg-cyan-500 text-slate-950 rounded-lg text-xs font-bold shadow-md hover:bg-cyan-400"
                      >
                        BIND ID
                      </button>
                    </div>
                  </form>
                )}

                {linkedMembers.length === 0 ? (
                  <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
                    No Telegram users connected yet. Send <code className="bg-cyan-950 text-cyan-300 px-1 py-0.5 rounded">/link {currentUser.linkCode}</code> in Telegram to connect!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkedMembers.map((member) => {
                      const isEditing = editingMemberId === member.id;
                      return (
                        <div
                          key={member.id || member.telegramChatId}
                          className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800 hover:border-cyan-500/30 transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-bold flex items-center justify-center text-xs shrink-0">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              {isEditing ? (
                                <div className="flex items-center space-x-2 my-1">
                                  <input
                                    type="text"
                                    value={aliasInput}
                                    onChange={(e) => setAliasInput(e.target.value)}
                                    placeholder="Nickname e.g. Wife"
                                    className="px-2 py-1 text-xs bg-slate-950 border border-cyan-400 rounded-lg text-white outline-hidden"
                                    autoFocus
                                  />
                                  <select
                                    value={roleInput}
                                    onChange={(e) => setRoleInput(e.target.value as any)}
                                    className="px-2 py-1 text-xs bg-slate-950 border border-cyan-400 rounded-lg text-white outline-hidden"
                                  >
                                    <option value="owner">Owner</option>
                                    <option value="family">Family</option>
                                    <option value="partner">Partner / Wife</option>
                                    <option value="member">Member</option>
                                  </select>
                                  <button
                                    onClick={() => handleSaveMemberAlias(member.id || member.telegramChatId)}
                                    className="p-1 bg-cyan-500 text-slate-950 rounded-md text-xs font-bold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingMemberId(null)}
                                    className="p-1 text-slate-400 hover:text-white"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-xs text-white truncate">
                                      {member.customAlias || member.name}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md border ${
                                      member.role === 'owner' ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40' : 'bg-pink-950 text-pink-300 border-pink-500/40'
                                    }`}>
                                      {member.role === 'owner' ? 'OWNER' : (member.role === 'partner' ? 'WIFE / PARTNER' : 'FAMILY')}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                                    <span>CHAT_ID: <code className="text-cyan-400">{member.telegramChatId}</code></span>
                                    {member.telegramUsername && <span>• @{member.telegramUsername}</span>}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {!isEditing && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => {
                                  setEditingMemberId(member.id);
                                  setAliasInput(member.customAlias || member.name);
                                  setRoleInput(member.role || 'family');
                                }}
                                className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Edit display nickname"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleUnlinkMember(member.id || member.telegramChatId, member.customAlias || member.name)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Disconnect Telegram chat"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions: Switch Profile or Log Out */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('switch');
                    setError('');
                  }}
                  className="px-3.5 py-2 text-xs font-mono text-cyan-400 hover:bg-cyan-950/40 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>SWITCH VAULT</span>
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('');
                      setLoginPassword('');
                      setError('');
                      setPasswordSuccess('');
                      setShowChangePassword(false);
                      onLogout();
                      setActiveTab('switch');
                    }}
                    className="px-3.5 py-2 text-xs font-mono text-rose-400 hover:bg-rose-950/40 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>LOCK & SIGN OUT</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SECURE LOGIN WITH EMAIL & PASSWORD */}
          {activeTab === 'switch' && (
            <form onSubmit={handleLogin} autoComplete="off" className="space-y-4">
              <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 space-y-3.5">
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-cyan-400" />
                  <p className="text-xs font-bold text-white uppercase tracking-wider">
                    {currentUser ? 'Switch or Login to Another Vault' : 'Unlock Private Expense Vault'}
                  </p>
                </div>

                {currentUser && (
                  <div className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-cyan-400 font-bold">CURRENT ACTIVE VAULT</p>
                      <p className="text-xs text-white font-bold">{currentUser.name} <span className="text-slate-400 font-normal font-mono">({currentUser.email})</span></p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        setActiveTab('switch');
                      }}
                      className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 rounded-lg text-[10px] transition-colors cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  Enter your registered email and Security Password / PIN to access your encrypted financial matrix:
                </p>
                
                {passwordSuccess && (
                  <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-center space-x-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                {error && (
                  <div className="bg-rose-950/80 border border-rose-500/40 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-start space-x-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      placeholder="e.g. abhiveo4@gmail.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-cyan-300 focus:border-cyan-400 outline-hidden"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Master Password / Security PIN *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                      >
                        {showLoginPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showLoginPassword ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        placeholder="Enter password or 4-6 digit PIN"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-hidden tracking-wider"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      * If logging into an existing account for the first time, the password entered will set your master lock.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !loginEmail.trim() || !loginPassword.trim()}
                    className="w-full mt-2 py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Unlock className="w-4 h-4 stroke-[2.5]" />
                        <span>UNLOCK PRIVATE VAULT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register');
                    setError('');
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                >
                  Don't have a secure vault yet? Register New Account
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: REGISTER NEW USER WITH MASTER PASSWORD */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="bg-rose-950/80 border border-rose-500/40 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 space-y-3.5">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-4 h-4 text-cyan-400" />
                  <p className="text-xs font-bold text-white uppercase tracking-wider">
                    Create New Protected Vault
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Profile / Family Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Abhi & Family / Shared"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. abhiveo4@gmail.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-cyan-300 focus:border-cyan-400 outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Master Password / PIN *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300"
                      >
                        {showRegisterPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      required
                      placeholder="Min 4 chars / PIN"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirm password"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:border-cyan-400 outline-hidden"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  🔒 Your expenses and Telegram links will be strictly isolated and protected by this password.
                </p>

                <div className="pt-2 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('switch');
                      setError('');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 text-xs font-bold rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                        <span>CREATE SECURE VAULT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
