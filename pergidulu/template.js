'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    {{{ info_article }}}
</section>
<section class="body">
    {{{ body }}}
</section>
`);


exports.structure_template = structure_template;
