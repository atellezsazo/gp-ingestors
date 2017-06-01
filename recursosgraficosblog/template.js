'use strict';

const structure_template = (`
<section class="header">
    <div class="extra-header">
        <div class="context">{{{category}}}</div>
        <div class="extra-header-right">
            <span class="author">{{{author}}}</span> 
            <span class="date-published">{{date_published}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</section>
<section class="body">
    {{{ body }}}
</section>
`);

exports.structure_template = structure_template;