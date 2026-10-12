import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive, Bookmark, BookOpen, Check, ChevronDown, CircleHelp, FileText,
  FolderPlus, Lightbulb, LoaderCircle, LockKeyhole, NotebookPen, Pin,
  Plus, Search, Sparkles, X,
} from 'lucide-react';
import {
  getListNotebooksQueryKey, getListNotesQueryKey, useArchiveNote,
  useCreateNotebook, useCreateNote, useListNotebooks, useListNotes,
  useUpdateNotebook, useUpdateNote,
} from '@workspace/api-client-react';
import type { IdeationItem, Notebook } from '@workspace/api-client-react';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const notebookSchema = z.object({
  title: z.string().trim().min(1, 'Give this notebook a name.').max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  category: z.string().max(60).optional(),
  color: z.string().optional(),
});
const itemSchema = z.object({
  notebookId: z.string().min(1, 'Choose a notebook.'),
  title: z.string().trim().min(1, 'Give this thought a title.').max(180),
  content: z.string().max(50000).optional(),
  kind: z.enum(['note', 'idea']),
  tags: z.string().optional(),
  category: z.string().max(60).optional(),
  status: z.enum(['captured', 'exploring', 'validating', 'in_progress']),
  problem: z.string().max(4000).optional(),
  audience: z.string().max(1000).optional(),
  proposedSolution: z.string().max(4000).optional(),
  potentialValue: z.string().max(2000).optional(),
  openQuestions: z.string().max(4000).optional(),
  nextActions: z.string().max(2000).optional(),
});
type NotebookValues = z.infer<typeof notebookSchema>;
type ItemValues = z.infer<typeof itemSchema>;

const stages = [
  { id: 'captured', label: 'Captured', color: 'bg-[#d9e8dd] text-[#355d4e]' },
  { id: 'exploring', label: 'Exploring', color: 'bg-[#f5e6c9] text-[#8b612b]' },
  { id: 'validating', label: 'Validating', color: 'bg-[#dce8ee] text-[#45697b]' },
  { id: 'in_progress', label: 'In motion', color: 'bg-[#e6dcef] text-[#705781]' },
] as const;
const swatches = [
  { value: '#d9a75e', label: 'Saffron' }, { value: '#6e9b82', label: 'Sage' },
  { value: '#7797a3', label: 'Lake' }, { value: '#af7b83', label: 'Rose' },
];
const panelClass = 'rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]';
const fieldClass = 'border-[hsl(var(--border))] bg-[hsl(var(--background))] focus-visible:ring-[hsl(var(--primary)/.25)]';

function FormFieldText({ control, name, label, placeholder, multiline = false }: {
  control: any; name: string; label: string; placeholder?: string; multiline?: boolean;
}) {
  return <FormField control={control} name={name} render={({ field }) => (
    <FormItem className="space-y-1.5">
      <FormLabel className="text-xs font-semibold text-[hsl(var(--foreground)/.78)]">{label}</FormLabel>
      <FormControl>{multiline
        ? <Textarea {...field} value={field.value ?? ''} placeholder={placeholder} rows={3} className={`${fieldClass} resize-y rounded-2xl`} data-testid={`field-${name}`} />
        : <Input {...field} value={field.value ?? ''} placeholder={placeholder} className={`${fieldClass} h-11 rounded-2xl`} data-testid={`field-${name}`} />}</FormControl>
      <FormMessage />
    </FormItem>
  )} />;
}

function Ideation() {
  const qc = useQueryClient();
  const [activeNotebook, setActiveNotebook] = useState('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'note' | 'idea'; item?: IdeationItem } | null>(null);
  const [notebookEditor, setNotebookEditor] = useState<Notebook | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const notebooksQuery = useListNotebooks();
  const notesQuery = useListNotes({ search: search.trim() || undefined, includeArchived: showArchived || undefined });
  const createNotebook = useCreateNotebook();
  const updateNotebook = useUpdateNotebook();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const archiveNote = useArchiveNote();
  const notebooks = notebooksQuery.data || [];
  const items = notesQuery.data || [];
  const visibleNotebooks = notebooks.filter((book) => showArchived || !book.isArchived);
  const visibleItems = useMemo(() => items.filter((item) =>
    (showArchived || !item.isArchived) &&
    (activeNotebook === 'all' || item.notebookId === activeNotebook),
  ), [items, activeNotebook, showArchived]);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
    void qc.invalidateQueries({ queryKey: getListNotesQueryKey() });
  };
  const notebookForm = useForm<NotebookValues>({
    resolver: zodResolver(notebookSchema),
    defaultValues: { title: '', description: '', icon: 'book', category: '', color: swatches[0].value },
  });
  const itemForm = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: { notebookId: '', title: '', content: '', kind: 'note', tags: '', category: '', status: 'captured', problem: '', audience: '', proposedSolution: '', potentialValue: '', openQuestions: '', nextActions: '' },
  });
  const beginNotebook = (book: Notebook | 'new') => {
    setNotebookEditor(book);
    notebookForm.reset(book === 'new' ? { title: '', description: '', icon: 'book', category: '', color: swatches[0].value } : {
      title: book.title, description: book.description || '', icon: book.icon, category: book.category || '', color: book.color || swatches[0].value,
    });
  };
  const beginItem = (mode: 'note' | 'idea', item?: IdeationItem) => {
    setEditor({ mode, item });
    itemForm.reset(item ? {
      notebookId: item.notebookId, title: item.title, content: item.content || '', kind: item.kind,
      tags: item.tags.join(', '), category: item.category || '', status: item.status === 'archived' ? 'captured' : item.status,
      problem: item.problem || '', audience: item.audience || '', proposedSolution: item.proposedSolution || '',
      potentialValue: item.potentialValue || '', openQuestions: item.openQuestions || '', nextActions: item.nextActions || '',
    } : { notebookId: activeNotebook === 'all' ? notebooks.find((b) => !b.isArchived)?.id || '' : activeNotebook,
      title: '', content: '', kind: mode, tags: '', category: '', status: 'captured', problem: '', audience: '',
      proposedSolution: '', potentialValue: '', openQuestions: '', nextActions: '' });
  };
  const saveNotebook = (values: NotebookValues) => {
    const data = { title: values.title, description: values.description || null, icon: values.icon || 'book', category: values.category || null, color: values.color || null };
    const onSuccess = () => { setNotebookEditor(null); setNotice('Notebook saved'); invalidate(); };
    if (notebookEditor && notebookEditor !== 'new') updateNotebook.mutate({ id: notebookEditor.id, data }, { onSuccess });
    else createNotebook.mutate({ data }, { onSuccess });
  };
  const saveItem = (values: ItemValues) => {
    const payload = {
      notebookId: values.notebookId, title: values.title, content: values.content || null, kind: values.kind,
      tags: (values.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      category: values.category || null, status: values.kind === 'idea' ? values.status : 'captured',
      problem: values.kind === 'idea' ? values.problem || null : null,
      audience: values.kind === 'idea' ? values.audience || null : null,
      proposedSolution: values.kind === 'idea' ? values.proposedSolution || null : null,
      potentialValue: values.kind === 'idea' ? values.potentialValue || null : null,
      openQuestions: values.kind === 'idea' ? values.openQuestions || null : null,
      nextActions: values.kind === 'idea' ? values.nextActions || null : null,
    };
    const onSuccess = () => { setEditor(null); setNotice('Thought saved'); invalidate(); };
    if (editor?.item) updateNote.mutate({ id: editor.item.id, data: payload }, { onSuccess });
    else createNote.mutate({ data: payload }, { onSuccess });
  };
  const archiveBook = (book: Notebook) => updateNotebook.mutate({ id: book.id, data: { isArchived: true } }, {
    onSuccess: () => { setNotice('Notebook archived'); if (activeNotebook === book.id) setActiveNotebook('all'); invalidate(); },
  });
  const togglePin = (item: IdeationItem) => updateNote.mutate({ id: item.id, data: { pinned: !item.pinned } }, { onSuccess: invalidate });
  const updateStage = (item: IdeationItem, status: 'captured' | 'exploring' | 'validating' | 'in_progress') =>
    updateNote.mutate({ id: item.id, data: { status } }, { onSuccess: invalidate });
  const archiveItem = (item: IdeationItem) => archiveNote.mutate({ id: item.id }, { onSuccess: () => { setNotice('Moved to archive'); invalidate(); } });
  const restoreItem = (item: IdeationItem) => updateNote.mutate({ id: item.id, data: { isArchived: false, ...(item.kind === 'idea' ? { status: 'captured' as const } : {}) } }, { onSuccess: () => { setNotice('Thought restored'); invalidate(); } });
  const restoreBook = (book: Notebook) => updateNotebook.mutate({ id: book.id, data: { isArchived: false } }, { onSuccess: () => { setNotice('Notebook restored'); invalidate(); } });
  const busy = createNotebook.isPending || updateNotebook.isPending || createNote.isPending || updateNote.isPending || archiveNote.isPending;
  const mutationFailed = [createNotebook.error, updateNotebook.error, createNote.error, updateNote.error, archiveNote.error].some(Boolean);

  return <div className="animate-rise">
    <section className="relative mb-8 overflow-hidden rounded-[30px] bg-[#dce9df] px-6 py-8 sm:px-9 sm:py-10">
      <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full border-[1px] border-[#739b82]/20 sm:right-12"><div className="absolute inset-7 rounded-full border border-[#739b82]/20" /><div className="absolute inset-14 rounded-full border border-[#739b82]/20" /></div>
      <div className="relative max-w-2xl">
        <p className="mono text-[10px] uppercase tracking-[.2em] text-[#527762]">A private space to think</p>
        <h1 className="serif mt-3 text-4xl font-semibold tracking-[-.045em] text-[#203f34] sm:text-5xl">Let the thought<br className="hidden sm:block" /> find its shape.</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-[#4d695b]">Keep the fragments, questions, and beginnings that deserve a little more room.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => beginItem('note')} disabled={!notebooks.some((b) => !b.isArchived)} data-testid="button-quick-capture" className="rounded-full bg-[#285746] text-[#fff8ec] hover:bg-[#1f4839]"><Plus className="mr-2 h-4 w-4" /> Capture a note</Button>
          <Button variant="outline" onClick={() => beginItem('idea')} disabled={!notebooks.some((b) => !b.isArchived)} data-testid="button-new-idea" className="rounded-full border-[#789583]/50 bg-[#f6f4e9]/75 text-[#294d3e] hover:bg-[#f6f4e9]"><Lightbulb className="mr-2 h-4 w-4" /> Develop an idea</Button>
        </div>
      </div>
      <div className="relative mt-7 flex items-center gap-2 text-xs text-[#496656]"><LockKeyhole className="h-3.5 w-3.5" /> Private to you <span className="mx-1 h-1 w-1 rounded-full bg-[#8ca495]" /> Nothing here is published</div>
    </section>

    {notice && <div role="status" data-testid="status-save-feedback" className="mb-4 flex items-center gap-2 rounded-2xl bg-[#e3eee3] px-4 py-3 text-sm font-medium text-[#315744]"><Check className="h-4 w-4" />{notice}<button aria-label="Dismiss message" data-testid="button-dismiss-feedback" className="ml-auto" onClick={() => setNotice('')}><X className="h-4 w-4" /></button></div>}
    {mutationFailed && <div role="alert" data-testid="status-save-error" className="mb-4 flex items-center gap-2 rounded-2xl border border-[hsl(var(--destructive)/.2)] bg-[hsl(var(--destructive)/.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]"><CircleHelp className="h-4 w-4" />That change didn’t save. Your editor is still open; please try again.</div>}

    <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className={`${panelClass} p-4`}>
        <div className="flex items-center justify-between px-2 pb-3">
          <div><p className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Your library</p><h2 className="serif mt-1 text-xl">Notebooks</h2></div>
          <button onClick={() => beginNotebook('new')} aria-label="Create notebook" data-testid="button-new-notebook" className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--primary))] transition hover:scale-105"><FolderPlus className="h-4 w-4" /></button>
        </div>
        <button onClick={() => setActiveNotebook('all')} data-testid="button-filter-all-notebooks" className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${activeNotebook === 'all' ? 'bg-[hsl(var(--secondary))] font-semibold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}><BookOpen className="h-4 w-4" /> All thoughts</button>
        {notebooksQuery.isLoading ? <div className="grid gap-2 p-2">{[1, 2].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />)}</div>
          : notebooksQuery.error ? <div className="p-3 text-xs text-[hsl(var(--destructive))]" role="alert">Notebooks could not load. <button className="underline" data-testid="button-retry-notebooks" onClick={() => notebooksQuery.refetch()}>Try again</button></div>
          : visibleNotebooks.length ? <div className="grid gap-1">{visibleNotebooks.map((book) => <div key={book.id} className={`group flex items-center gap-2 rounded-2xl pr-1 transition ${activeNotebook === book.id ? 'bg-[hsl(var(--secondary))]' : 'hover:bg-[hsl(var(--muted))]'}`}>
            <button onClick={() => setActiveNotebook(book.id)} data-testid={`button-select-notebook-${book.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: book.color || '#739b82' }}>{book.icon?.slice(0, 1).toUpperCase() || 'N'}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{book.title}</span><span className="block text-[10px] text-[hsl(var(--muted-foreground))]">{book.notesCount} {book.notesCount === 1 ? 'thought' : 'thoughts'}</span></span>
            </button>
            <button aria-label={`Edit ${book.title}`} onClick={() => beginNotebook(book)} data-testid={`button-edit-notebook-${book.id}`} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition hover:text-[hsl(var(--foreground))] group-hover:opacity-100 focus:opacity-100"><NotebookPen className="h-3.5 w-3.5" /></button>
            {book.isArchived ? <button aria-label={`Restore ${book.title}`} onClick={() => restoreBook(book)} data-testid={`button-restore-notebook-${book.id}`} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition hover:text-[hsl(var(--primary))] group-hover:opacity-100 focus:opacity-100"><Check className="h-3.5 w-3.5" /></button> : <button aria-label={`Archive ${book.title}`} onClick={() => archiveBook(book)} data-testid={`button-archive-notebook-${book.id}`} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition hover:text-[hsl(var(--destructive))] group-hover:opacity-100 focus:opacity-100"><Archive className="h-3.5 w-3.5" /></button>}
          </div>)}</div>
          : <div className="px-3 py-5 text-center"><BookOpen className="mx-auto h-6 w-6 text-[hsl(var(--primary))]" /><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">A notebook gives your thoughts a place to land.</p><button onClick={() => beginNotebook('new')} data-testid="button-empty-create-notebook" className="mt-3 text-xs font-semibold text-[hsl(var(--primary))]">Create your first</button></div>}
        <div className="mt-4 border-t border-[hsl(var(--border))] pt-3">
          <button onClick={() => setShowArchived((value) => !value)} data-testid="button-toggle-archive" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><Archive className="h-3.5 w-3.5" />{showArchived ? 'Hide archived' : 'Show archive'}<ChevronDown className={`ml-auto h-3.5 w-3.5 transition ${showArchived ? 'rotate-180' : ''}`} /></button>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]">{activeNotebook === 'all' ? 'Your working context' : notebooks.find((b) => b.id === activeNotebook)?.category || 'Notebook'}</p><h2 className="serif mt-1 text-3xl tracking-[-.035em]">{activeNotebook === 'all' ? 'All your thoughts' : notebooks.find((b) => b.id === activeNotebook)?.title || 'Notebook'}</h2></div>
          <label className="relative block w-full sm:max-w-[290px]"><span className="sr-only">Search notes and ideas</span><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a thought…" data-testid="input-search-ideation" className={`h-11 w-full rounded-full border pl-10 pr-4 text-sm outline-none ${fieldClass}`} /></label>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {stages.map((stage) => <span key={stage.id} className={`rounded-full px-3 py-1 text-[10px] font-semibold ${stage.color}`}>{stage.label}</span>)}
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]"><LockKeyhole className="h-3 w-3" /> Private collection</span>
        </div>
        {notesQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((n) => <div key={n} className="h-44 animate-pulse rounded-[24px] bg-[hsl(var(--muted))]" />)}</div>
          : notesQuery.error ? <div role="alert" className={`${panelClass} p-10 text-center`}><CircleHelp className="mx-auto h-7 w-7 text-[hsl(var(--destructive))]" /><h3 className="serif mt-3 text-xl">A moment of quiet</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">We couldn’t reach your thoughts just now.</p><Button variant="outline" onClick={() => notesQuery.refetch()} data-testid="button-retry-notes" className="mt-4 rounded-full">Try again</Button></div>
          : visibleItems.length === 0 ? <div className={`${panelClass} grid min-h-[300px] place-items-center border-dashed p-8 text-center`}><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-[#e2eee3] text-[#527762]"><Sparkles className="h-6 w-6" /></span><h3 className="serif mt-4 text-2xl">{search ? 'No matching thoughts' : showArchived ? 'Nothing in the archive yet' : 'A little space to begin'}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">{search ? 'Try another phrase or clear your search.' : 'Capture a passing note or give an idea its first outline. It will stay private here.'}</p>{!search && !showArchived && <Button onClick={() => beginItem('note')} disabled={!notebooks.some((b) => !b.isArchived)} data-testid="button-empty-capture" className="mt-5 rounded-full"><Plus className="mr-2 h-4 w-4" />Capture a thought</Button>}{notebooks.length === 0 && <button onClick={() => beginNotebook('new')} data-testid="button-empty-notebook-prompt" className="mt-4 block w-full text-xs font-semibold text-[hsl(var(--primary))]">Start by creating a notebook</button>}</div></div>
          : <div className="grid gap-3 sm:grid-cols-2">{visibleItems.map((item) => <article key={item.id} data-testid={`card-ideation-item-${item.id}`} className="group relative flex min-h-[200px] flex-col rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.35)] hover:shadow-[0_12px_34px_-26px_hsl(var(--foreground)/.3)]">
            <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-xl ${item.kind === 'idea' ? 'bg-[#f4e9d3] text-[#936a31]' : 'bg-[#e4eee6] text-[#4d765e]'}`}>{item.kind === 'idea' ? <Lightbulb className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><span className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">{item.notebookTitle}</span>{item.pinned && <Pin className="ml-auto h-3.5 w-3.5 rotate-45 text-[#ba8b45]" />}</div>
            <button onClick={() => beginItem(item.kind, item)} data-testid={`button-open-item-${item.id}`} className="mt-4 text-left"><h3 className="serif text-xl leading-tight">{item.title}</h3><p className="mt-2 line-clamp-3 min-h-[3.5rem] text-sm leading-6 text-[hsl(var(--muted-foreground))]">{item.content || item.problem || 'An idea waiting for its next question.'}</p></button>
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">{item.kind === 'idea' && <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${stages.find((s) => s.id === item.status)?.color || 'bg-[hsl(var(--muted))]'}`}>{stages.find((s) => s.id === item.status)?.label || 'Captured'}</span>}{item.category && <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 text-[9px] text-[hsl(var(--muted-foreground))]">{item.category}</span>}{item.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-[hsl(var(--background))] px-2.5 py-1 text-[9px] text-[hsl(var(--muted-foreground))]">{tag}</span>)}<div className="ml-auto flex gap-1">{item.isArchived ? <button aria-label="Restore thought" onClick={() => restoreItem(item)} data-testid={`button-restore-item-${item.id}`} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--primary))]"><Check className="h-3.5 w-3.5" /></button> : <><button aria-label={item.pinned ? 'Unpin thought' : 'Pin thought'} onClick={() => togglePin(item)} data-testid={`button-pin-item-${item.id}`} className={`rounded-lg p-2 transition hover:bg-[hsl(var(--muted))] ${item.pinned ? 'text-[#b48643]' : 'text-[hsl(var(--muted-foreground))]'}`}><Bookmark className="h-3.5 w-3.5" /></button><button aria-label="Archive thought" onClick={() => archiveItem(item)} data-testid={`button-archive-item-${item.id}`} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))]"><Archive className="h-3.5 w-3.5" /></button></>}</div></div>
            {item.kind === 'idea' && !item.isArchived && <div className="mt-3 flex items-center gap-1 border-t border-[hsl(var(--border))] pt-3"><span className="mr-1 text-[9px] text-[hsl(var(--muted-foreground))]">Move to</span>{stages.filter((stage) => stage.id !== item.status).map((stage) => <button key={stage.id} onClick={() => updateStage(item, stage.id)} data-testid={`button-stage-${stage.id}-${item.id}`} aria-label={`Move to ${stage.label}`} className="h-2 w-6 rounded-full bg-[hsl(var(--border))] transition hover:w-9 hover:bg-[hsl(var(--primary))]" title={stage.label} />)}</div>}
          </article>)}</div>}
        {busy && <div className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-[#244e3d] px-4 py-2.5 text-xs font-medium text-[#fff8ec] shadow-lg" role="status" data-testid="status-saving"><LoaderCircle className="h-4 w-4 animate-spin" />Saving your changes</div>}
      </section>
    </div>

    {notebookEditor && <div className="fixed inset-0 z-50 grid place-items-center bg-[#173b32]/45 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setNotebookEditor(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="notebook-dialog-title" className="w-full max-w-lg rounded-[28px] bg-[hsl(var(--card))] p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--primary))]">A place for a thread</p><h2 id="notebook-dialog-title" className="serif mt-2 text-3xl">{notebookEditor === 'new' ? 'New notebook' : 'Edit notebook'}</h2></div><button onClick={() => setNotebookEditor(null)} aria-label="Close notebook editor" data-testid="button-close-notebook-editor" className="rounded-full p-2 hover:bg-[hsl(var(--muted))]"><X className="h-4 w-4" /></button></div>
        <Form {...notebookForm}><form onSubmit={notebookForm.handleSubmit(saveNotebook)} className="grid gap-4">
          <FormFieldText control={notebookForm.control} name="title" label="Notebook name" placeholder="A thought-world, a project, a question…" />
          <FormFieldText control={notebookForm.control} name="description" label="A note to yourself" placeholder="What belongs here?" multiline />
          <div className="grid gap-4 sm:grid-cols-2"><FormFieldText control={notebookForm.control} name="category" label="Category" placeholder="Personal, work, curiosity…" /><FormFieldText control={notebookForm.control} name="icon" label="Mark" placeholder="e.g. leaf" /></div>
          <FormField control={notebookForm.control} name="color" render={({ field }) => <FormItem><FormLabel className="text-xs font-semibold">Notebook color</FormLabel><FormControl><div className="flex gap-2">{swatches.map((swatch) => <button type="button" key={swatch.value} aria-label={swatch.label} aria-pressed={field.value === swatch.value} onClick={() => field.onChange(swatch.value)} data-testid={`button-notebook-color-${swatch.label.toLowerCase()}`} className={`h-8 w-8 rounded-full ring-offset-2 transition ${field.value === swatch.value ? 'ring-2 ring-[hsl(var(--foreground))]' : ''}`} style={{ backgroundColor: swatch.value }} />)}</div></FormControl></FormItem>} />
           <div className="mt-2 flex justify-end gap-2"><Button type="button" variant="ghost" data-testid="button-cancel-notebook" onClick={() => setNotebookEditor(null)}>Cancel</Button><Button type="submit" disabled={createNotebook.isPending || updateNotebook.isPending} data-testid="button-save-notebook" className="rounded-full">{createNotebook.isPending || updateNotebook.isPending ? 'Saving…' : 'Save notebook'}</Button></div>
        </form></Form>
      </section>
    </div>}

    {editor && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#173b32]/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && setEditor(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="item-dialog-title" className="my-auto max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-[hsl(var(--card))] p-5 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--primary))]">{editor.item ? 'Return to a thought' : 'Keep this close'}</p><h2 id="item-dialog-title" className="serif mt-2 text-3xl">{editor.item ? 'Shape your thought' : editor.mode === 'idea' ? 'Give an idea room' : 'Capture a note'}</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Private, unfinished, and allowed to change.</p></div><button onClick={() => setEditor(null)} aria-label="Close thought editor" data-testid="button-close-item-editor" className="rounded-full p-2 hover:bg-[hsl(var(--muted))]"><X className="h-4 w-4" /></button></div>
        <Form {...itemForm}><form onSubmit={itemForm.handleSubmit(saveItem)} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={itemForm.control} name="notebookId" render={({ field }) => <FormItem><FormLabel className="text-xs font-semibold">Notebook</FormLabel><FormControl><select {...field} data-testid="select-item-notebook" className={`h-11 w-full rounded-2xl border px-3 text-sm outline-none ${fieldClass}`}><option value="">Choose a notebook</option>{notebooks.filter((book) => !book.isArchived).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></FormControl><FormMessage /></FormItem>} />
            <FormField control={itemForm.control} name="kind" render={({ field }) => <FormItem><FormLabel className="text-xs font-semibold">This is a</FormLabel><FormControl><select {...field} onChange={(event) => { field.onChange(event); setEditor((current) => current ? { ...current, mode: event.target.value as 'note' | 'idea' } : current); }} data-testid="select-item-kind" className={`h-11 w-full rounded-2xl border px-3 text-sm outline-none ${fieldClass}`}><option value="note">Note</option><option value="idea">Idea</option></select></FormControl></FormItem>} />
          </div>
          <FormFieldText control={itemForm.control} name="title" label="Title" placeholder="A few words to find this again" />
          <FormFieldText control={itemForm.control} name="content" label={editor.mode === 'idea' ? 'First thoughts' : 'Note'} placeholder="Write the part you want to remember…" multiline />
          <div className="grid gap-4 sm:grid-cols-2"><FormFieldText control={itemForm.control} name="category" label="Category" placeholder="Optional" /><FormFieldText control={itemForm.control} name="tags" label="Tags" placeholder="Comma-separated" /></div>
          {editor.mode === 'idea' && <>
            <FormField control={itemForm.control} name="status" render={({ field }) => <FormItem><FormLabel className="text-xs font-semibold">Progress stage</FormLabel><FormControl><select {...field} data-testid="select-idea-status" className={`h-11 w-full rounded-2xl border px-3 text-sm outline-none ${fieldClass}`}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></FormControl></FormItem>} />
            <div className="rounded-[22px] bg-[hsl(var(--secondary)/.55)] p-4 sm:p-5"><p className="mb-4 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))]"><Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />Idea workbench</p><div className="grid gap-4 sm:grid-cols-2"><FormFieldText control={itemForm.control} name="problem" label="The tension or problem" placeholder="What feels unresolved?" multiline /><FormFieldText control={itemForm.control} name="audience" label="Who is this for?" placeholder="A person or group" multiline /><FormFieldText control={itemForm.control} name="proposedSolution" label="A possible answer" placeholder="What might help?" multiline /><FormFieldText control={itemForm.control} name="potentialValue" label="Why it could matter" placeholder="What might change?" multiline /><FormFieldText control={itemForm.control} name="openQuestions" label="Questions to keep open" placeholder="What do you still need to learn?" multiline /><FormFieldText control={itemForm.control} name="nextActions" label="A next small step" placeholder="One thing to try" multiline /></div></div>
          </>}
           <div className="mt-1 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4"><span className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]"><LockKeyhole className="h-3 w-3" />Only you can see this</span><div className="flex gap-2"><Button type="button" variant="ghost" data-testid="button-cancel-item" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={createNote.isPending || updateNote.isPending} data-testid="button-save-item" className="rounded-full">{createNote.isPending || updateNote.isPending ? 'Saving…' : editor.item ? 'Save changes' : 'Save thought'}</Button></div></div>
        </form></Form>
      </section>
    </div>}
  </div>;
}

export default Ideation;
