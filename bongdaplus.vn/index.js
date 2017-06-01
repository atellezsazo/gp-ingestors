'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'http://bongdaplus.vn/';
const max_links = 3; // max links per 'rss'
const rss_feed = [
    'http://bongdaplus.vn/rss/trang-chu.rss', // home
    'http://bongdaplus.vn/rss/viet-nam/2.rss', // vietnam
    'http://bongdaplus.vn/rss/anh/13.rss', // english
    'http://bongdaplus.vn/rss/tay-ban-nha/18.rss', // Spain
    'http://bongdaplus.vn/rss/duc/24.rss', //
    'http://bongdaplus.vn/rss/italia/21.rss', // Italy
    'http://bongdaplus.vn/rss/phap/27.rss', // France
    'http://bongdaplus.vn/rss/champions-league/131.rss', // Uefa champions league
    'http://bongdaplus.vn/rss/u20-world-cup/144.rss', // star
    'http://bongdaplus.vn/rss/the-gioi/30.rss', // world
    'http://bongdaplus.vn/rss/the-thao/62.rss', // sport
    'http://bongdaplus.vn/rss/dam-me/63.rss', //
    'http://bongdaplus.vn/rss/chuyen-nhuong/58.rss', // transfer
    'http://bongdaplus.vn/rss/europa-league/132.rss', // europa league
    'http://bongdaplus.vn/rss/biem-hoa/137.rss', // carton
];

// cleaning elements
const clean_elements = ['a', 'div', 'figure', 'h2', 'i', 'p', 'span', 'table',
    'td', 'tr', 'ul'
];

// delete attr (tag)
const remove_attr = ['align', 'class', 'data-field', 'data-original', 'h',
    'height', 'id', 'itemscope', 'itemprop', 'itemtype', 'photoid', 'rel',
    'sizes', 'style', 'title', 'type', 'w', 'width', 'dir',
];

// remove elements (body)
const remove_elements = ['.adtxt', '.auth', '.cl10', '.clr', '.cref',
    '.embedbox', '.fbshr', '.goosip', '.moreref', '.nsrc', '.taglst', '.tit',
    '#AbdVideoInPagePlayerWrapper', 'br', 'iframe', 'noscript', 'script', 'style'
];

// delete duplicated elements in array
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// remove empty paragraphs
function remove_empty_tag($, elem, tag='p') {
    $(elem).find(tag).get().map((t) => {
        const text=$(t).text(), child=$(t).children();
        if (child.length==0) {
            $(t).remove();
        } else if (child.length == 1) {
            const ch = $(child[0]).children();
            if (text.length <= 1 && ch.length == 0) {
                $(t).remove();
            }
        }
    });
}

/**   ingest_article()
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('.auth b').text();
        const body = $($('.ncont').first()[0] || $('.nlive').first()[0]);
        const category = $('.breakcrum').first().clone();
        const copyright = $('.copybar b font').text();
        const description = $('meta[property="og:description"]').attr('content');
        const published = body.find('.period').first().text().replace(' ',''); // for template
        const modified_date = $('meta[itemprop="dateModified"]').attr('content') // for asset
        const modified_time = modified_date.replace(' ','T').replace(/\s/g,'');
        const keywords = $('.taglst').first().clone();
        const section = $('meta[property="og:type"]').attr('content');
        const title = body.find('.tit').text() || $('meta[property="og:title"]').attr('content');
        const uri_main_image = body.find('.news-avatar').first().attr('src');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_license(copyright);
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // remove elements and clean tags
        const clean_attr = (tag, a=remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find(remove_elements.join(',')).remove();
        clean_tags(body.find(clean_elements.join(',')));
        clean_tags(category.find(clean_elements.join(',')));
        body.find('a').get().map((a) => a.attribs.href = url.resolve(base_uri, a.attribs.href));
        remove_empty_tag($, body);
        body.find('span').get().map((span) => {
            const text = $(span).text().substring(0,8);
            if (text.includes('VIDEO:')) {
                $(span).remove();
            }
        });

        // generating tags
        const categories = cheerio('<div></div>');
        category.find('a').get().map((a) => {
            categories.append(cheerio(`<a href="${url.resolve(base_uri,a.attribs.href)}">${$(a).text()}</a>`));
        });
        const tags = cheerio('<div></div>');
        keywords.find('a').get().map((a) => {
            tags.append(cheerio(`<a href="${url.resolve(base_uri,a.attribs.href)}">${$(a).text()}</a>`));
        });

        // download images
        let thumb;
        body.find('img').get().map((img) => {
            if (img.attribs.src) {
                clean_attr(img);
                const src = img.attribs.src;
                img.attribs.src = src.substring(src.lastIndexOf('http'));
                const image = libingester.util.download_img(img);
                image.set_title(title);
                hatch.save_asset(image);
                if (!thumb) {
                    asset.set_thumbnail(thumb = image);
                }
            } else {
                $(img).remove();
            }
        });

        const content = mustache.render(template.structure_template, {
            author: author,
            body: body.html(),
            category: categories.html(),
            published_date: published,
            tags: tags.html(),
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();
    let links = [];

    const get_links = (f) => {
        return Promise.all(
            rss_feed.map((uri_rss) => {
                return new Promise((resolve, reject) => {
                    rss2json.load(uri_rss, (err, rss) => {
                        let l=1;
                        for (const item of rss.items) {
                            if (l++ > max_links) {
                                break;
                            }
                            links.push(item.url);
                        }
                        resolve();
                    });
                })
            })
        ).then(f);
    }

    get_links(() => Promise.all(
        links.unique().map((uri) => ingest_article(hatch, uri))
    ).then(() => {
        return hatch.finish();
    }));
}

main();
