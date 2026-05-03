<script lang="ts">
  interface Props {
    data: Record<string, string>;
  }
  let { data }: Props = $props();
</script>

<div class="frontmatter-card">
  <table>
    <tbody>
      {#each Object.entries(data) as [key, value]}
        <tr>
          <td class="fm-key">{key}</td>
          <td class="fm-val">{value}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .frontmatter-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 1.5rem;
    overflow: hidden;
    font-size: 0.875rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  /* Override github-markdown-css which sets .markdown-body table tr { background: var(--bgColor-default) }
     — that var isn't wired to our dark-mode tokens, so rows stay white on dark backgrounds. */
  tr {
    background: transparent !important;
  }

  tr:nth-child(2n) {
    background: transparent !important;
  }

  tr + tr td {
    border-top: 1px solid var(--border);
  }

  .fm-key {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    color: var(--muted);
    padding: 0.5rem 0.75rem;
    white-space: nowrap;
    vertical-align: top;
    width: 140px;
    min-width: 100px;
  }

  .fm-val {
    color: var(--fg);
    padding: 0.5rem 0.75rem;
    word-break: break-word;
  }
</style>
