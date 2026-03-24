import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { ArrowLeft, ArrowRight, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const VIDEO_ANALYSIS_SIGNALS = [
  { id: 'color_grading', name: 'Color Grading', description: 'Professional color correction and grading' },
  { id: 'lighting_quality', name: 'Lighting Quality', description: 'Lighting setup complexity and control' },
  { id: 'composition', name: 'Composition', description: 'Frame composition and visual hierarchy' },
  { id: 'cinematography', name: 'Cinematography', description: 'Camera movement and shot variety' },
  { id: 'camera_equipment', name: 'Camera Equipment Quality', description: 'Image sharpness and dynamic range' },
  { id: 'editing_pacing', name: 'Editing & Pacing', description: 'Cut timing and rhythm' },
  { id: 'production_design', name: 'Production Design', description: 'Set design and visual polish' },
  { id: 'overall_craft', name: 'Overall Craft', description: 'Professional production value' },
];

const AVAILABLE_CRITERIA = [
  { name: 'Craft', description: 'Production quality, creative execution, and narrative effectiveness' },
  { name: 'Awards', description: 'Industry recognition (Cannes, D&AD, One Show, Clio, ADC)' },
  { name: 'Press', description: 'Media coverage in mainstream and trade publications' },
  { name: 'Personality & Side Hustles', description: 'Personal projects and creative pursuits outside of client work' },
  { name: 'Past Clients', description: 'Quality and relevance of brands they have worked with' },
  { name: 'Types of Work', description: 'Range and diversity of mediums and formats' },
];

export default function CreateJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    client_name: '',
    role_type: 'copywriter',
    is_team: false,
    brief: '',
    public_summary: '',
    level: 'senior',
    industry: 'technology',
    project_start_date: '',
    project_end_date: '',
    extension_possible: false,
    pay_rate_min: '',
    pay_rate_max: '',
    pay_rate_type: 'daily',
    mediums: [],
    application_deadline: '',
    criteria_weights: {
      'Craft': 25,
      'Awards': 25,
      'Press': 25,
      'Past Clients': 25
    },
  });

  const [mediumInput, setMediumInput] = useState('');

  const toggleCriterion = (criterionName) => {
    setFormData(prev => {
      const newWeights = { ...prev.criteria_weights };
      if (newWeights[criterionName]) {
        delete newWeights[criterionName];
      } else {
        newWeights[criterionName] = 10;
      }
      return { ...prev, criteria_weights: newWeights };
    });
  };

  const updateWeight = (criterionName, value) => {
    setFormData(prev => ({
      ...prev,
      criteria_weights: {
        ...prev.criteria_weights,
        [criterionName]: value
      }
    }));
  };

  const addIndustry = () => {
    if (industryInput.trim()) {
      setFormData(prev => ({
        ...prev,
        industries: [...prev.industries, industryInput.trim()]
      }));
      setIndustryInput('');
    }
  };

  const removeIndustry = (index) => {
    setFormData(prev => ({
      ...prev,
      industries: prev.industries.filter((_, i) => i !== index)
    }));
  };

  const addMedium = () => {
    if (mediumInput.trim()) {
      setFormData(prev => ({
        ...prev,
        mediums: [...prev.mediums, mediumInput.trim()]
      }));
      setMediumInput('');
    }
  };

  const removeMedium = (index) => {
    setFormData(prev => ({
      ...prev,
      mediums: prev.mediums.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    console.log('Creating position...', formData);
    setIsSubmitting(true);
    try {
      const shareCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      // Build criteria from weights
      const criteria = Object.entries(formData.criteria_weights).map(([name, weight]) => {
        const criterion = AVAILABLE_CRITERIA.find(c => c.name === name);
        return {
          name: criterion.name,
          description: criterion.description,
          weight: weight
        };
      });

      // Auto-enable all video signals if Craft is selected
      const videoSignals = formData.criteria_weights['Craft'] 
        ? VIDEO_ANALYSIS_SIGNALS.map(s => s.id)
        : [];

      const jobData = {
        title: formData.title,
        client_name: formData.client_name,
        role_type: formData.is_team ? 'team' : formData.role_type,
        brief: formData.brief,
        public_summary: formData.public_summary,
        level: formData.level,
        industry: formData.industry,
        project_start_date: formData.project_start_date,
        project_end_date: formData.project_end_date,
        extension_possible: formData.extension_possible,
        pay_rate_min: formData.pay_rate_min ? Number(formData.pay_rate_min) : undefined,
        pay_rate_max: formData.pay_rate_max ? Number(formData.pay_rate_max) : undefined,
        pay_rate_type: formData.pay_rate_type,
        mediums: formData.mediums,
        application_deadline: formData.application_deadline,
        criteria: criteria,
        video_analysis_signals: videoSignals,
        share_code: shareCode,
        status: 'open',
      };
      
      console.log('Creating job with data:', jobData);
      const job = await base44.entities.Job.create(jobData);
      console.log('Job created:', job);
      
      toast.success('Position created successfully!');
      navigate(createPageUrl(`JobDetails?id=${job.id}`));
    } catch (error) {
      console.error('Failed to create job:', error);
      toast.error(`Failed: ${error.message || 'Please try again'}`);
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <Link to={createPageUrl('Dashboard')} className="inline-flex items-center text-slate-600 hover:text-orange-600 mb-8 transition-colors font-medium group">
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </Link>

        {/* Progress */}
        <div className="flex items-center gap-4 mb-12 overflow-x-auto pb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-3 flex-shrink-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all shadow-lg ${
                step >= s ? 'bg-gradient-to-br from-orange-600 to-amber-600 text-white scale-110' : 'bg-slate-200 text-slate-400'
              }`}>
                {s}
              </div>
              <span className={`brand-font text-sm font-medium ${step >= s ? 'text-slate-900' : 'text-slate-400'}`}>
                {s === 1 ? 'Job Details' : s === 2 ? 'Project Info' : 'Criteria'}
              </span>
              {s < 3 && <div className="w-16 h-1 rounded-full bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Step 1: Job Details */}
        {step === 1 && (
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="pb-2 border-b border-orange-100/50">
              <CardTitle className="brand-font text-3xl font-bold text-slate-900">Position Details</CardTitle>
              <p className="text-slate-600 font-medium">Define the role and paste the creative brief</p>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-700 mb-2 block">Job Title</Label>
                  <Input
                    placeholder="e.g., Senior Copywriter"
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-slate-700 mb-2 block">Agency / Client Name</Label>
                  <Input
                    placeholder="e.g., Wieden+Kennedy"
                    value={formData.client_name}
                    onChange={e => setFormData(prev => ({ ...prev, client_name: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-700 mb-2 block">Talent Level</Label>
                  <Select value={formData.level} onValueChange={(value) => setFormData(prev => ({ ...prev, level: value }))}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="mid">Mid-Level</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-700 mb-2 block">Discipline</Label>
                  <Select 
                    value={formData.role_type} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, role_type: value }))}
                    disabled={formData.is_team}
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="copywriter">Copywriter</SelectItem>
                      <SelectItem value="art_director">Art Director</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <Switch
                  checked={formData.is_team}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_team: checked }))}
                />
                <Label className="text-slate-700 cursor-pointer">Looking for a creative team (Copywriter + Art Director)</Label>
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Application Deadline</Label>
                <Input
                  type="datetime-local"
                  value={formData.application_deadline}
                  onChange={e => setFormData(prev => ({ ...prev, application_deadline: e.target.value }))}
                  className="h-12 rounded-xl border-slate-200 max-w-xs"
                />
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Creative Brief (Confidential)</Label>
                <Textarea
                  placeholder="Paste the brief from your creative team. Include role requirements, desired experience, campaign context, and what you're looking for in a candidate's portfolio..."
                  value={formData.brief}
                  onChange={e => setFormData(prev => ({ ...prev, brief: e.target.value }))}
                  className="min-h-[180px] rounded-xl border-slate-200 resize-none"
                />
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Public Summary (for LinkedIn)</Label>
                <Textarea
                  placeholder="Write a public-facing summary that omits confidential information. This will be shared when posting the role on LinkedIn..."
                  value={formData.public_summary}
                  onChange={e => setFormData(prev => ({ ...prev, public_summary: e.target.value }))}
                  className="min-h-[120px] rounded-xl border-slate-200 resize-none"
                />
                <p className="text-xs text-slate-500 mt-2">This will be visible to applicants - no confidential client or campaign details</p>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => setStep(2)}
                  disabled={!formData.title || !formData.brief}
                  className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-2xl px-10 h-14 shadow-xl shadow-orange-200/50 font-semibold"
                >
                  Continue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Project Info */}
        {step === 2 && (
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="pb-2 border-b border-orange-100/50">
              <CardTitle className="brand-font text-3xl font-bold text-slate-900">Project Information</CardTitle>
              <p className="text-slate-600 font-medium">Define what you're looking for</p>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-700 mb-2 block">Industry</Label>
                  <Select value={formData.industry} onValueChange={(value) => setFormData(prev => ({ ...prev, industry: value }))}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technology">Technology</SelectItem>
                      <SelectItem value="automotive">Automotive</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="consumer_goods">Consumer Goods</SelectItem>
                      <SelectItem value="sports">Sports</SelectItem>
                      <SelectItem value="entertainment">Entertainment</SelectItem>
                      <SelectItem value="fashion">Fashion</SelectItem>
                      <SelectItem value="food_beverage">Food & Beverage</SelectItem>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="nonprofit">Nonprofit</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-700 mb-2 block">Pay Rate Type</Label>
                  <Select value={formData.pay_rate_type} onValueChange={(value) => setFormData(prev => ({ ...prev, pay_rate_type: value }))}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly Rate</SelectItem>
                      <SelectItem value="daily">Daily Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-700 mb-2 block">Min Pay Rate ($)</Label>
                  <Input
                    type="number"
                    placeholder="500"
                    value={formData.pay_rate_min}
                    onChange={e => setFormData(prev => ({ ...prev, pay_rate_min: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-slate-700 mb-2 block">Max Pay Rate ($)</Label>
                  <Input
                    type="number"
                    placeholder="800"
                    value={formData.pay_rate_max}
                    onChange={e => setFormData(prev => ({ ...prev, pay_rate_max: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-700 mb-2 block">Project Start Date</Label>
                  <Input
                    type="date"
                    value={formData.project_start_date}
                    onChange={e => setFormData(prev => ({ ...prev, project_start_date: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-slate-700 mb-2 block">Project End Date</Label>
                  <Input
                    type="date"
                    value={formData.project_end_date}
                    onChange={e => setFormData(prev => ({ ...prev, project_end_date: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <Switch
                  checked={formData.extension_possible}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, extension_possible: checked }))}
                />
                <Label className="text-slate-700 cursor-pointer">Possibility of project extension</Label>
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Types of Mediums/Projects</Label>
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="e.g., Film, Social, Branding, Website"
                    value={mediumInput}
                    onChange={e => setMediumInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMedium())}
                    className="h-12 rounded-xl border-slate-200"
                  />
                  <Button type="button" onClick={addMedium} className="h-12 px-6 rounded-xl">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.mediums.map((medium, i) => (
                    <Badge key={i} className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1">
                      {medium}
                      <button onClick={() => removeMedium(i)} className="ml-2 hover:text-amber-900">×</button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-6">
                <Button 
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="rounded-2xl px-8 h-14 font-medium border-2"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button 
                  onClick={() => setStep(3)}
                  className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-2xl px-10 h-14 shadow-xl shadow-orange-200/50 font-semibold"
                >
                  Continue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Criteria */}
        {step === 3 && (
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="pb-2 border-b border-orange-100/50">
              <div>
                <CardTitle className="brand-font text-3xl font-bold text-slate-900">Evaluation Criteria</CardTitle>
                <p className="text-slate-600 font-medium">Select criteria and set their percentage weights</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3 mb-6">
                {AVAILABLE_CRITERIA.map(criterion => {
                  const isSelected = formData.criteria_weights[criterion.name] !== undefined;
                  const weight = formData.criteria_weights[criterion.name] || 10;
                  
                  return (
                    <div key={criterion.name} className={`p-4 rounded-xl transition-all ${
                      isSelected ? 'bg-orange-50 border-2 border-orange-200' : 'bg-slate-50 border-2 border-transparent'
                    }`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={criterion.name}
                          checked={isSelected}
                          onCheckedChange={() => toggleCriterion(criterion.name)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <label htmlFor={criterion.name} className="cursor-pointer block">
                            <div className="font-semibold text-slate-900 mb-1">{criterion.name}</div>
                            <div className="text-sm text-slate-600">{criterion.description}</div>
                            {criterion.name === 'Craft' && isSelected && (
                              <div className="text-xs text-orange-600 mt-2 font-medium">
                                ✓ Video production analysis automatically enabled
                              </div>
                            )}
                          </label>
                          {isSelected && (
                            <div className="mt-3 flex items-center gap-3">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={weight}
                                onChange={(e) => updateWeight(criterion.name, parseInt(e.target.value) || 0)}
                                className="w-20 h-9 text-center"
                              />
                              <span className="text-sm font-medium text-slate-700">%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={`p-4 rounded-xl ${
                Object.values(formData.criteria_weights).reduce((a, b) => a + b, 0) === 100 
                  ? 'bg-emerald-50 border border-emerald-200' 
                  : 'bg-amber-50 border border-amber-200'
              }`}>
                <p className={`text-sm ${
                  Object.values(formData.criteria_weights).reduce((a, b) => a + b, 0) === 100 
                    ? 'text-emerald-700' 
                    : 'text-amber-700'
                }`}>
                  <span className="font-semibold">
                    Total: {Object.values(formData.criteria_weights).reduce((a, b) => a + b, 0)}%
                  </span>
                  {Object.values(formData.criteria_weights).reduce((a, b) => a + b, 0) !== 100 && ' (must equal 100%)'}
                </p>
              </div>

              <div className="flex justify-between pt-8">
                <Button 
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="rounded-2xl px-8 h-14 font-medium border-2"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={isSubmitting || Object.values(formData.criteria_weights).reduce((a, b) => a + b, 0) !== 100}
                  className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-2xl px-10 h-14 shadow-xl shadow-orange-200/50 font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : null}
                  Create Position
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}