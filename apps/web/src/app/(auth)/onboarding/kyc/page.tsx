'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { KalamLogo } from '@/components/ui/KalamLogo';
import { useAuthStore } from '@/stores/auth.store';
import { api, ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { KycStatusPolling } from '@/components/onboarding/kyc-status-polling';
import type { AccountType } from '@hedera-social/shared/types/user.types';

interface IndividualFormData {
  fullLegalName: string;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  countryOfBirth: string;
  cityOfBirth: string;
  currentResidentialAddress: string;
  nationalIdNumber: string;
  gender: string;
  passportNumber: string;
  occupation: string;
}

interface BusinessFormData {
  legalEntityName: string;
  countryOfIncorporation: string;
  businessRegistrationNumber: string;
  businessAddress: string;
  primaryActivityDescription: string;
}

const INITIAL_INDIVIDUAL: IndividualFormData = {
  fullLegalName: '',
  dateOfBirth: '',
  nationality: 'US',
  countryOfResidence: 'US',
  countryOfBirth: 'US',
  cityOfBirth: '',
  currentResidentialAddress: '',
  nationalIdNumber: '',
  gender: '',
  passportNumber: '',
  occupation: '',
};

const INITIAL_BUSINESS: BusinessFormData = {
  legalEntityName: '',
  countryOfIncorporation: 'US',
  businessRegistrationNumber: '',
  businessAddress: '',
  primaryActivityDescription: '',
};

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'AE', name: 'UAE' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'QA', name: 'Qatar' },
  { code: 'OM', name: 'Oman' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'SG', name: 'Singapore' },
];

/** Reusable dark input style */
const inputCls = 'w-full h-[40px] rounded-[10px] border border-border bg-white/[0.04] px-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors';
const selectCls = 'w-full h-[40px] rounded-[10px] border border-border bg-white/[0.04] px-3 text-[14px] text-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 appearance-none transition-colors';
const labelCls = 'block text-[12px] font-semibold text-muted-foreground mb-1';

export default function KycPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    user,
    setOnboardingStep,
    setScreeningId: storeSetScreeningId,
    screeningId: storedScreeningId,
  } = useAuthStore();

  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [submitted, setSubmitted] = useState(!!storedScreeningId);
  const [screeningId, setScreeningId] = useState<string>(storedScreeningId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [individualForm, setIndividualForm] = useState<IndividualFormData>(INITIAL_INDIVIDUAL);
  const [businessForm, setBusinessForm] = useState<BusinessFormData>(INITIAL_BUSINESS);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/register');
    } else if (user?.status === 'active') {
      router.push('/onboarding/success');
    }
  }, [isAuthenticated, user?.status, router]);

  if (!isAuthenticated || user?.status === 'active') return null;

  const handleIndividualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setIndividualForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleBusinessChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setBusinessForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = (): string | null => {
    if (accountType === 'individual') {
      if (!individualForm.fullLegalName.trim()) return 'Full legal name is required';
      if (!individualForm.dateOfBirth) return 'Date of birth is required';
      if (!individualForm.nationalIdNumber.trim()) return 'National ID / document number is required';
      if (!individualForm.cityOfBirth.trim()) return 'City of birth is required';
      if (!individualForm.currentResidentialAddress.trim()) return 'Residential address is required';
    } else {
      if (!businessForm.legalEntityName.trim()) return 'Legal entity name is required';
      if (!businessForm.businessRegistrationNumber.trim()) return 'Registration number is required';
      if (!businessForm.businessAddress.trim()) return 'Business address is required';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      let result: { requestId: string; submittedAt: string; userId: string };

      if (accountType === 'individual') {
        result = await api.submitIndividualKyc({
          fullLegalName: individualForm.fullLegalName,
          dateOfBirth: individualForm.dateOfBirth,
          nationality: individualForm.nationality || 'US',
          countryOfResidence: individualForm.countryOfResidence || individualForm.nationality || 'US',
          countryOfBirth: individualForm.countryOfBirth || individualForm.nationality || 'US',
          cityOfBirth: individualForm.cityOfBirth,
          currentResidentialAddress: individualForm.currentResidentialAddress,
          nationalIdNumber: individualForm.nationalIdNumber,
          ...(individualForm.gender && { gender: individualForm.gender }),
          ...(individualForm.passportNumber && { passportNumber: individualForm.passportNumber }),
          ...(individualForm.occupation && { occupation: individualForm.occupation }),
        });
      } else {
        result = await api.submitCorporateKyc({
          legalEntityName: businessForm.legalEntityName,
          countryOfIncorporation: businessForm.countryOfIncorporation,
          businessRegistrationNumber: businessForm.businessRegistrationNumber,
          businessAddress: businessForm.businessAddress,
          ...(businessForm.primaryActivityDescription && {
            primaryActivityDescription: businessForm.primaryActivityDescription,
          }),
        });
      }

      setScreeningId(result.requestId);
      storeSetScreeningId(result.requestId);
      setOnboardingStep('kyc_polling');
      setSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('KYC submission failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApproved = () => {
    setOnboardingStep('success');
    router.push('/onboarding/success');
  };

  const handleRejected = () => {
    setSubmitted(false);
    setScreeningId('');
    setError('Your verification was not approved. Please try again.');
  };

  if (submitted && screeningId) {
    return <KycStatusPolling onApproved={handleApproved} onRejected={handleRejected} />;
  }

  return (
    <div className="w-full max-w-[560px] mx-4">
      {/* Progress bar: step 4 active */}
      <div className="flex gap-1.5 mb-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-[4px] flex-1 rounded-full', i <= 3 ? 'bg-primary' : 'bg-white/[0.12]')} />
        ))}
      </div>

      {/* Logo + heading */}
      <div className="flex flex-col items-center mb-6">
        <KalamLogo className="h-[40px] w-auto mb-3" />
        <h1 className="text-[22px] font-extrabold text-foreground">Identity Verification</h1>
        <p className="text-[14px] text-muted-foreground mt-1">Complete KYC/KYB to activate your account</p>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-2.5 rounded-full text-[13px]">
          {error}
        </div>
      )}

      {/* Account type selection — lemon selected state per spec */}
      <div className="mb-5">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Account Type</p>
        <div className="grid grid-cols-2 gap-3">
          {(['individual', 'business'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAccountType(type)}
              className={cn(
                'h-[44px] rounded-[12px] border-2 text-[14px] font-semibold capitalize transition-all',
                accountType === type
                  ? 'border-primary bg-primary/8 text-foreground'
                  : 'border-border text-muted-foreground hover:border-white/20 hover:bg-white/[0.04]',
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        {accountType === 'individual' ? (
          <>
            {/* Section divider per spec */}
            <div className="border-t border-border pt-4">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4">Personal Details</p>
            </div>

            <div>
              <label htmlFor="fullLegalName" className={labelCls}>Full Legal Name *</label>
              <input id="fullLegalName" type="text" name="fullLegalName" value={individualForm.fullLegalName}
                onChange={handleIndividualChange} placeholder="John Michael Doe"
                className={inputCls} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="dateOfBirth" className={labelCls}>Date of Birth *</label>
                <input id="dateOfBirth" type="date" name="dateOfBirth" value={individualForm.dateOfBirth}
                  onChange={handleIndividualChange} className={inputCls} required />
              </div>
              <div>
                <label htmlFor="gender" className={labelCls}>Gender</label>
                <select id="gender" name="gender" value={individualForm.gender} onChange={handleIndividualChange} className={selectCls}>
                  <option value="">Select (optional)</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="nationality" className={labelCls}>Nationality *</label>
                <select id="nationality" autoComplete="off" value={individualForm.nationality}
                  onChange={(e) => setIndividualForm(p => ({ ...p, nationality: e.target.value }))}
                  className={selectCls}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="countryOfResidence" className={labelCls}>Country of Residence *</label>
                <select id="countryOfResidence" autoComplete="off" value={individualForm.countryOfResidence}
                  onChange={(e) => setIndividualForm(p => ({ ...p, countryOfResidence: e.target.value }))}
                  className={selectCls}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="countryOfBirth" className={labelCls}>Country of Birth *</label>
                <select id="countryOfBirth" autoComplete="off" value={individualForm.countryOfBirth}
                  onChange={(e) => setIndividualForm(p => ({ ...p, countryOfBirth: e.target.value }))}
                  className={selectCls}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="cityOfBirth" className={labelCls}>City of Birth *</label>
                <input id="cityOfBirth" type="text" name="cityOfBirth" value={individualForm.cityOfBirth}
                  onChange={handleIndividualChange} placeholder="New York" className={inputCls} required />
              </div>
            </div>

            <div>
              <label htmlFor="currentResidentialAddress" className={labelCls}>Residential Address *</label>
              <input id="currentResidentialAddress" type="text" name="currentResidentialAddress"
                value={individualForm.currentResidentialAddress} onChange={handleIndividualChange}
                placeholder="123 Main St, New York, 10001, US" className={inputCls} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="nationalIdNumber" className={labelCls}>National ID Number *</label>
                <input id="nationalIdNumber" type="text" name="nationalIdNumber" value={individualForm.nationalIdNumber}
                  onChange={handleIndividualChange} placeholder="123-45-6789" className={inputCls} required />
              </div>
              <div>
                <label htmlFor="passportNumber" className={labelCls}>Passport Number</label>
                <input id="passportNumber" type="text" name="passportNumber" value={individualForm.passportNumber}
                  onChange={handleIndividualChange} placeholder="AB1234567 (optional)" className={inputCls} />
              </div>
            </div>

            <div>
              <label htmlFor="occupation" className={labelCls}>Occupation</label>
              <input id="occupation" type="text" name="occupation" value={individualForm.occupation}
                onChange={handleIndividualChange} placeholder="Software Engineer (optional)" className={inputCls} />
            </div>
          </>
        ) : (
          <>
            <div className="border-t border-border pt-4">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4">Business Details</p>
            </div>

            <div>
              <label htmlFor="legalEntityName" className={labelCls}>Legal Entity Name *</label>
              <input id="legalEntityName" type="text" name="legalEntityName" value={businessForm.legalEntityName}
                onChange={handleBusinessChange} placeholder="Acme Inc." className={inputCls} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="countryOfIncorporation" className={labelCls}>Country of Incorporation *</label>
                <select id="countryOfIncorporation" name="countryOfIncorporation" value={businessForm.countryOfIncorporation}
                  onChange={handleBusinessChange} className={selectCls}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="businessRegistrationNumber" className={labelCls}>Registration Number *</label>
                <input id="businessRegistrationNumber" type="text" name="businessRegistrationNumber"
                  value={businessForm.businessRegistrationNumber} onChange={handleBusinessChange}
                  placeholder="REG123456" className={inputCls} required />
              </div>
            </div>

            <div>
              <label htmlFor="businessAddress" className={labelCls}>Business Address *</label>
              <input id="businessAddress" type="text" name="businessAddress" value={businessForm.businessAddress}
                onChange={handleBusinessChange} placeholder="123 Business Ave, New York, 10001, US"
                className={inputCls} required />
            </div>

            <div>
              <label htmlFor="primaryActivityDescription" className={labelCls}>Business Activity</label>
              <textarea id="primaryActivityDescription" name="primaryActivityDescription"
                value={businessForm.primaryActivityDescription} onChange={handleBusinessChange}
                placeholder="Describe your primary business activity (optional)"
                rows={3}
                className="w-full rounded-[14px] border border-border bg-white/[0.04] px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 resize-none transition-colors" />
            </div>
          </>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-[46px] rounded-full bg-primary text-black font-semibold text-[15px] hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? 'Submitting…' : 'Submit for Verification'}
        </button>
      </form>

      {/* Skip button when KYC disabled */}
      {!env.NEXT_PUBLIC_ENABLE_KYC && (
        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => {
              setOnboardingStep('success');
              router.push('/onboarding/success');
            }}
            className="w-full h-[40px] rounded-full border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            Skip Verification (KYC disabled)
          </button>
        </div>
      )}
    </div>
  );
}
