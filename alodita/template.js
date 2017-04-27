'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    <div class="date-post">{{ date_post }}</div>
</section>
<section class="body">
    {{{ body }}}
</section>`);

exports.structure_template = structure_template;